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

const Customer = db.Customer;
const TierInfo  = db.TierInfo;

const getReferralPoints = () => ({
  silver:   parseInt(process.env.SilverReferralPoint   || 100, 10),
  gold:     parseInt(process.env.GoldReferralPoint     || 150, 10),
  platinum: parseInt(process.env.PlatinumReferralPoint || 200, 10),
});

const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
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

export const submitReferral = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, dateOfBirth, anniversaryDate, whomReferNumber } = req.body;

    if (!whomReferNumber || !phoneNumber) {
      return errorResponse(res, null, 'phoneNumber and whomReferNumber are required', 400);
    }

    // ── Read-only checks (no DB writes yet) ───────────────────────────

    const referrer = await findCustomerByPhone(whomReferNumber);
    if (!referrer) {
      return errorResponse(res, null, 'Invalid referral: customer has not joined our loyalty program', 404);
    }

    const alreadyJoined = await findCustomerByPhone(phoneNumber);
    if (alreadyJoined) {
      return errorResponse(res, null, 'Referral customer is already joined with our loyalty program', 409);
    }

    // ── All Shopify API calls BEFORE any DB writes ────────────────────
    // If any Shopify call fails here, nothing is committed to the DB.

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

    const points      = getReferralPoints();
    const tierKey     = referrer.currentTier || 'silver';
    const pointsToAdd = points[tierKey] ?? points.silver;
    const couponCode  = generateCouponCode();

    // Discount creation is the last Shopify call — if it fails, nothing hits the DB
    await createShopifyDiscountCode(referrer.shopifyCustomerId, pointsToAdd, couponCode);

    // ── Single DB transaction: create customer + update referrer ──────
    // Both writes succeed together or both roll back.

    const phoneDigits = String(phoneNumber).replace(/\D/g, '');
    const updatedReferralPart = [
      ...(referrer.customerReferralPart || []),
      {
        name:        `${firstName || ''} ${lastName || ''}`.trim(),
        phonenumber: String(phoneNumber).replace(/\D/g, '').slice(-10),
        customer_id: shopifyCustomerId,
        couponCode,
      },
    ];

    let newCustomer;
    await db.sequelize.transaction(async (t) => {
      newCustomer = await Customer.create({
        shopifyCustomerId,
        shopName:        process.env.shopName,
        email:           email || shopifyCustomer.email || null,
        phone:           phoneDigits,
        firstName:       firstName || shopifyCustomer.firstName || '',
        lastName:        lastName  || shopifyCustomer.lastName  || '',
        birthdayDate:    dateOfBirth    || null,
        anniversaryDate: anniversaryDate || null,
        currentTier:     'silver',
        totalSpent:      parseFloat(shopifyCustomer.amountSpent?.amount || 0),
        ordersCount:     parseInt(shopifyCustomer.numberOfOrders || 0, 10),
      }, { transaction: t });

      await referrer.update({
        referralCount:        (referrer.referralCount || 0) + 1,
        customerReferralPart: updatedReferralPart,
        wallet:               parseFloat(((parseFloat(referrer.wallet) || 0) + pointsToAdd).toFixed(2)),
      }, { transaction: t });
    });

    // ── Shopify note sync (best-effort — DB is already committed) ─────
    // Note failures are logged but do NOT fail the request.
    try {
      await updateShopifyCustomerNote(referrer.shopifyCustomerId, tierKey, updatedReferralPart);
      await updateShopifyCustomerNote(shopifyCustomerId, 'silver', []);
    } catch (noteErr) {
      console.error('[ReferralController] Shopify note update failed (non-critical):', noteErr.message);
    }

    const tierInfo = await TierInfo.findOne({ where: { shopName: process.env.shopName } });
    const silverBenefits = tierInfo ? tierInfo.silver : null;

    return successResponse(res, { customerId: newCustomer.id, couponCode, tierBenefits: silverBenefits }, 'Referral submitted successfully');

  } catch (err) {
    console.error('[ReferralController] submitReferral error:', err);
    return errorResponse(res, err, 'Failed to submit referral', 500);
  }
};

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

    const totalReferrals   = referrers.reduce((s, c) => s + (c.referralCount || 0), 0);
    const totalWallet      = referrers.reduce((s, c) => s + parseFloat(c.wallet || 0), 0);
    const activeReferrers  = referrers.length;

    return successResponse(res, {
      stats: {
        totalReferrals,
        totalWallet:     parseFloat(totalWallet.toFixed(2)),
        activeReferrers,
      },
      referrers,
    }, 'Referral stats fetched');

  } catch (err) {
    console.error('[ReferralController] getReferralStats error:', err);
    return errorResponse(res, err, 'Failed to fetch referral stats', 500);
  }
};
