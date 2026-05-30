import { Op } from 'sequelize';
import db from '../models';
import {
  searchShopifyCustomerByPhone,
  createShopifyCustomer,
  updateShopifyCustomerNote,
  createShopifyDiscountCode,
  normalizePhone,
  extractNumericId,
} from '../helpers/shopify.helper';
import { successResponse, errorResponse } from '../helpers/response.helper';

const Customer       = db.Customer;
const TierInfo       = db.TierInfo;
const Order          = db.Order;
const ReferralReward = db.ReferralReward;

const getReferralPoints = () => ({
  silver:   parseInt(process.env.SilverReferralPoint   || 100, 10),
  gold:     parseInt(process.env.GoldReferralPoint     || 150, 10),
  platinum: parseInt(process.env.PlatinumReferralPoint || 200, 10),
});

const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const findCustomerByPhone = (phone) => {
  const last10 = String(phone).replace(/\D/g, '').slice(-10);
  return Customer.findOne({
    where: db.sequelize.where(
      db.sequelize.fn('RIGHT', db.sequelize.cast(db.sequelize.col('phone'), 'TEXT'), 10),
      last10
    ),
  });
};

// ─── Submit Referral ───────────────────────────────────────────────────────────
// Registers the new customer and logs a PENDING reward in referral_rewards.
// NO coupon is created here — coupon is created when the referred customer's
// first order reaches Credit status (via checkReferralOrders).

export const submitReferral = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, dateOfBirth, anniversaryDate, whomReferNumber } = req.body;

    if (!whomReferNumber || !phoneNumber) {
      return errorResponse(res, null, 'phoneNumber and whomReferNumber are required', 400);
    }

    // ── Phase 1: Read-only DB checks (no writes) ───────────────────────────
    const referrer = await findCustomerByPhone(whomReferNumber);
    if (!referrer) {
      return errorResponse(res, null, 'Invalid referral: customer has not joined our loyalty program', 404);
    }

    const alreadyJoined = await findCustomerByPhone(phoneNumber);
    if (alreadyJoined) {
      return errorResponse(res, null, 'Referral customer is already joined with our loyalty program', 409);
    }

    // ── Phase 2: All Shopify API calls (before any DB writes) ─────────────
    // If any Shopify call fails here nothing is written to DB.
    const normalizedPhone = normalizePhone(phoneNumber);
    let shopifyCustomer = await searchShopifyCustomerByPhone(normalizedPhone);
    if (!shopifyCustomer) {
      shopifyCustomer = await createShopifyCustomer({
        firstName: firstName || '',
        lastName:  lastName  || '',
        phone:     normalizedPhone,
        email:     email     || null,
      });
    }

    const shopifyCustomerId = extractNumericId(shopifyCustomer.id);
    const phoneDigits       = String(phoneNumber).replace(/\D/g, '');

    const updatedReferralPart = [
      ...(referrer.customerReferralPart || []),
      {
        name:           `${firstName || ''} ${lastName || ''}`.trim(),
        phonenumber:    phoneDigits.slice(-10),
        customer_id:    shopifyCustomerId,
        couponCode:     null,   // assigned later via checkReferralOrders
        couponAssigned: false,
      },
    ];

    // ── Phase 3: Single atomic DB transaction ──────────────────────────────
    // All three writes succeed together or all roll back (ACID).
    let newCustomer;
    await db.sequelize.transaction(async (t) => {
      // 3a. Create the referred customer
      newCustomer = await Customer.create({
        shopifyCustomerId,
        shopName:        process.env.shopName,
        email:           email || shopifyCustomer.email || null,
        phone:           phoneDigits,
        firstName:       firstName || shopifyCustomer.firstName || '',
        lastName:        lastName  || shopifyCustomer.lastName  || '',
        birthdayDate:    dateOfBirth     || null,
        anniversaryDate: anniversaryDate || null,
        currentTier:     'silver',
        totalSpent:      parseFloat(shopifyCustomer.amountSpent?.amount || 0),
        ordersCount:     parseInt(shopifyCustomer.numberOfOrders || 0, 10),
      }, { transaction: t });

      // 3b. Update referrer: increment count + log pending referral entry
      //     Wallet is NOT updated here — only updated when coupon is assigned
      await referrer.update({
        referralCount:        (referrer.referralCount || 0) + 1,
        customerReferralPart: updatedReferralPart,
      }, { transaction: t });

      // 3c. Create pending reward row — UNIQUE on referredShopifyId prevents
      //     double processing if this endpoint is called twice for the same customer
      await ReferralReward.create({
        referrerShopifyId: String(referrer.shopifyCustomerId),
        referredShopifyId: String(shopifyCustomerId),
        referredPhone:     phoneDigits.slice(-10),
        couponAssigned:    false,
      }, { transaction: t });
    });
    // If transaction throws, all three writes are rolled back automatically.

    // ── Phase 4: Shopify note sync (best-effort, after DB is committed) ────
    // Non-critical — DB is already saved. Note failure does NOT fail the request.
    try {
      await updateShopifyCustomerNote(referrer.shopifyCustomerId, referrer.currentTier || 'silver', updatedReferralPart);
      await updateShopifyCustomerNote(shopifyCustomerId, 'silver', []);
    } catch (noteErr) {
      console.error('[submitReferral] Shopify note update failed (non-critical):', noteErr.message);
    }

    const tierInfo       = await TierInfo.findOne({ where: { shopName: process.env.shopName } });
    const silverBenefits = tierInfo ? tierInfo.silver : null;

    return successResponse(res, {
      customerId:   newCustomer.id,
      tierBenefits: silverBenefits,
    }, 'Referral submitted successfully. Reward coupon will be issued after your first credited order.');

  } catch (err) {
    console.error('[ReferralController] submitReferral error:', err);
    return errorResponse(res, err, 'Failed to submit referral', 500);
  }
};

// ─── Check Referral Orders ─────────────────────────────────────────────────────
// Run daily after the credit job.
// Logic: find ALL pending (unassigned) rewards → check if the referred customer
// has at least ONE Credit order → if yes, assign the coupon to the referrer.
//
// Why not filter by creditDay = date?
// creditApi uses creditDay <= date, so orders from earlier days also get
// credited on the same run. A strict date equality would miss those.
// The couponAssigned = false flag makes every run fully idempotent.
//
// POST /api/referral/check-orders
// Body: { date: "2026-05-30" }

export const checkReferralOrders = async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return errorResponse(res, 'date is required (YYYY-MM-DD)', 'Bad Request', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return errorResponse(res, 'Invalid date format. Use YYYY-MM-DD', 'Bad Request', 400);
    }

    // ── Step 1: All pending (unassigned) rewards ───────────────────────────
    // Partial index idx_rr_coupon_assigned_false keeps this scan tiny at scale.
    const pendingRewards = await ReferralReward.findAll({
      where: { couponAssigned: false },
    });

    if (!pendingRewards.length) {
      return successResponse(res, { processed: 0, skipped: 0, failed: 0, date },
        'No pending referral rewards found');
    }

    // ── Step 2: Which referred customers have at least one Credit order? ───
    const referredIds = pendingRewards.map(r => String(r.referredShopifyId));

    const creditedRows = await Order.findAll({
      where: {
        shopifyCustomerId: { [Op.in]: referredIds },
        orderStatus:       'Credit',
      },
      attributes: ['shopifyCustomerId'],
      group:      ['shopifyCustomerId'],
    });

    const creditedSet = new Set(creditedRows.map(o => String(o.shopifyCustomerId)));

    const toProcess = pendingRewards.filter(r => creditedSet.has(String(r.referredShopifyId)));
    const skipped   = pendingRewards.length - toProcess.length;

    if (!toProcess.length) {
      return successResponse(res, { processed: 0, skipped, failed: 0, date },
        'Pending rewards exist but referred customers have no credited orders yet');
    }

    // ── Step 3: Assign coupons sequentially (respects Shopify rate limits) ──
    const points = getReferralPoints();
    let processed = 0;
    const failedList = [];

    for (const reward of toProcess) {
      try {
        const referrer = await Customer.findOne({
          where: { shopifyCustomerId: reward.referrerShopifyId },
        });

        if (!referrer) {
          failedList.push({ referredId: reward.referredShopifyId, reason: 'Referrer not found in DB' });
          continue;
        }

        const tierKey     = referrer.currentTier || 'silver';
        const pointsToAdd = points[tierKey] ?? points.silver;
        const couponCode  = generateCouponCode();

        // Shopify call first — before any DB write
        await createShopifyDiscountCode(referrer.shopifyCustomerId, pointsToAdd, couponCode);

        // Update customerReferralPart entry with the assigned coupon
        const updatedReferralPart = (referrer.customerReferralPart || []).map(entry =>
          String(entry.customer_id) === String(reward.referredShopifyId)
            ? { ...entry, couponCode, couponAssigned: true }
            : entry
        );

        // Atomic DB: reward row + referrer wallet + referral list — all or nothing
        await db.sequelize.transaction(async (t) => {
          await reward.update({
            couponAssigned: true,
            couponCode,
            pointsAwarded:  pointsToAdd,
          }, { transaction: t });

          await referrer.update({
            wallet:               parseFloat((parseFloat(referrer.wallet || 0) + pointsToAdd).toFixed(2)),
            customerReferralPart: updatedReferralPart,
          }, { transaction: t });
        });

        // Shopify note update — best-effort after DB committed
        try {
          await updateShopifyCustomerNote(referrer.shopifyCustomerId, tierKey, updatedReferralPart);
        } catch (noteErr) {
          console.error(`[checkReferralOrders] Note update failed for ${referrer.shopifyCustomerId}:`, noteErr.message);
        }

        processed++;
        console.log(`[checkReferralOrders] ✅ Coupon ${couponCode} (${pointsToAdd} pts) → referrer ${referrer.shopifyCustomerId}`);

      } catch (err) {
        console.error(`[checkReferralOrders] ❌ referredId ${reward.referredShopifyId}:`, err.message);
        failedList.push({ referredId: reward.referredShopifyId, reason: err.message });
      }
    }

    return successResponse(res, {
      date,
      processed,
      skipped,
      failed:        failedList.length,
      failedDetails: failedList.length ? failedList : undefined,
    }, `${processed} referral coupon(s) assigned`);

  } catch (err) {
    console.error('[ReferralController] checkReferralOrders error:', err);
    return errorResponse(res, err, 'Failed to process referral orders', 500);
  }
};

// ─── Referral Stats ────────────────────────────────────────────────────────────

export const getReferralStats = async (req, res) => {
  try {
    const referrers = await Customer.findAll({
      where: { referralCount: { [Op.gt]: 0 } },
      attributes: [
        'id', 'shopifyCustomerId', 'firstName', 'lastName', 'email', 'phone',
        'currentTier', 'referralCount', 'customerReferralPart', 'wallet',
      ],
      order: [['referralCount', 'DESC']],
    });

    const totalReferrals  = referrers.reduce((s, c) => s + (c.referralCount || 0), 0);
    const totalWallet     = referrers.reduce((s, c) => s + parseFloat(c.wallet || 0), 0);
    const activeReferrers = referrers.length;

    // Pending (unassigned) coupons from referral_rewards table
    const pendingCount = await ReferralReward.count({ where: { couponAssigned: false } });

    return successResponse(res, {
      stats: {
        totalReferrals,
        totalWallet:     parseFloat(totalWallet.toFixed(2)),
        activeReferrers,
        pendingCoupons:  pendingCount,
      },
      referrers,
    }, 'Referral stats fetched');

  } catch (err) {
    console.error('[ReferralController] getReferralStats error:', err);
    return errorResponse(res, err, 'Failed to fetch referral stats', 500);
  }
};
