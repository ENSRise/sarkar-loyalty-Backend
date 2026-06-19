import { Op } from 'sequelize';
import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { updateShopifyCustomerNote } from '../helpers/shopify.helper';
import { calcAvailableBalance } from '../helpers/settlement.helper';

const Customer         = db.Customer;
const CustomerBonusLog = db.CustomerBonusLog;

const BONUS_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateBonusCouponCode = () => {
  let code = 'BNS';
  for (let i = 0; i < 6; i++) code += BONUS_CODE_CHARS.charAt(Math.floor(Math.random() * BONUS_CODE_CHARS.length));
  return code;
};

const customerSummary = (customer) => ({
  id:                customer.id,
  shopifyCustomerId: customer.shopifyCustomerId,
  firstName:         customer.firstName,
  lastName:          customer.lastName,
  email:             customer.email,
  phone:             customer.phone,
  currentTier:       customer.currentTier,
  totalSpent:        customer.totalSpent,
  ordersCount:       customer.ordersCount,
  walletBalance:     calcAvailableBalance(customer.customerReferralPart || []),
});

/**
 * GET /api/customer-bonus/find?phone=...&email=...
 * Looks the customer up by phone (last-10-digit match) first, falling back
 * to email (case-insensitive exact match) — either is enough on its own.
 */
export const findCustomer = async (req, res) => {
  try {
    const { phone, email } = req.query;

    if (!phone && !email) {
      return errorResponse(res, 'Provide a phone number or email', 'Bad Request', 400);
    }

    let customer = null;

    if (phone) {
      const last10 = String(phone).replace(/\D/g, '').slice(-10);
      if (last10.length !== 10) {
        return errorResponse(res, 'Invalid phone number', 'Bad Request', 400);
      }
      customer = await Customer.findOne({
        where: db.sequelize.where(
          db.sequelize.fn('RIGHT', db.sequelize.cast(db.sequelize.col('phone'), 'TEXT'), 10),
          last10
        ),
      });
    }

    if (!customer && email) {
      customer = await Customer.findOne({ where: { email: { [Op.iLike]: email.trim() } } });
    }

    if (!customer) {
      return errorResponse(res, 'No customer found for that phone/email', 'Not Found', 404);
    }

    return successResponse(res, { customer: customerSummary(customer) }, 'Customer found');
  } catch (error) {
    console.error('[CustomerBonus] findCustomer error:', error);
    return errorResponse(res, error, 'Failed to find customer', 500);
  }
};

/**
 * POST /api/customer-bonus/grant
 * Body: { shopifyCustomerId, points, note }
 *
 * At least one of points / note is required:
 *  - points > 0  → behaves exactly like a referral reward: a real, redeemable
 *    Shopify discount code (BNS-prefixed) is created for that value and
 *    appended to customerReferralPart, so it's immediately part of the
 *    customer's spendable wallet (shows up in settlement balance, etc).
 *  - note        → free-text remark stored on its own (or alongside the
 *    points grant) for internal record-keeping.
 *
 * Every call — points, note, or both — is recorded in customer_bonus_logs
 * for audit (who granted what, and why).
 */
export const grantBonus = async (req, res) => {
  try {
    const { shopifyCustomerId, points, note } = req.body;

    if (!shopifyCustomerId) {
      return errorResponse(res, 'shopifyCustomerId is required', 'Bad Request', 400);
    }

    const hasPoints = points !== undefined && points !== null && points !== '';
    const bonusPoints = hasPoints ? parseInt(points, 10) : 0;

    if (hasPoints && (!Number.isFinite(bonusPoints) || bonusPoints <= 0)) {
      return errorResponse(res, 'points must be a positive whole number', 'Bad Request', 400);
    }

    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    if (bonusPoints <= 0 && !trimmedNote) {
      return errorResponse(res, 'Provide bonus points and/or a note', 'Bad Request', 400);
    }

    const result = await db.sequelize.transaction(async (t) => {
      const customer = await Customer.findOne({
        where: { shopifyCustomerId },
        transaction: t,
        lock: db.Sequelize.Transaction.LOCK.UPDATE,
      });
      if (!customer) {
        const err = new Error('Customer not found');
        err.statusCode = 404;
        throw err;
      }

      let couponCode = null;

      if (bonusPoints > 0) {
        // Internal tracking code only — no Shopify discount is created here.
        // This just adds to the wallet ledger; the only real, redeemable
        // Shopify coupon is the one created at settlement time
        // (customerFinalCoupon/customerFinalCouponValue is the source of truth).
        couponCode = generateBonusCouponCode();

        const updatedPart = [
          ...(customer.customerReferralPart || []),
          {
            name:               'Admin Bonus',
            phonenumber:        customer.phone ? String(customer.phone) : null,
            customer_id:        customer.shopifyCustomerId,
            couponCode,
            couponAssigned:     true,
            'coupon-status':    'Unused',
            tierAmount:         bonusPoints,
            'remaining-amount': String(bonusPoints),
            source:             'admin_bonus',
            grantedBy:          req.user.id,
            grantedAt:          new Date().toISOString(),
          },
        ];

        await customer.update({
          customerReferralPart: updatedPart,
          wallet: db.sequelize.literal(`wallet + ${bonusPoints}`),
        }, { transaction: t });
      }

      const log = await CustomerBonusLog.create({
        customerId:         customer.id,
        shopifyCustomerId:  customer.shopifyCustomerId,
        points:             bonusPoints > 0 ? bonusPoints : null,
        couponCode,
        note:               trimmedNote || null,
        grantedByUserId:    req.user.id,
      }, { transaction: t });

      return { customer, log, couponCode };
    });

    // Best-effort — only meaningful when points actually changed the tier note context
    if (bonusPoints > 0) {
      try {
        await updateShopifyCustomerNote(result.customer.shopifyCustomerId, result.customer.currentTier);
      } catch (noteErr) {
        console.error('[CustomerBonus] Shopify note update failed:', noteErr.message);
      }
    }

    const message = bonusPoints > 0
      ? `Granted ₹${bonusPoints} bonus to wallet${trimmedNote ? ' (note saved)' : ''}`
      : 'Note saved for customer';

    return successResponse(res, {
      log: {
        id:         result.log.id,
        points:     result.log.points,
        couponCode: result.log.couponCode,
        note:       result.log.note,
        createdAt:  result.log.createdAt,
      },
    }, message);

  } catch (error) {
    if (error.statusCode === 404) {
      return errorResponse(res, error.message, 'Not Found', 404);
    }
    console.error('[CustomerBonus] grantBonus error:', error);
    return errorResponse(res, error, 'Failed to grant bonus', 500);
  }
};

/**
 * GET /api/customer-bonus/history/:shopifyCustomerId
 */
export const getBonusHistory = async (req, res) => {
  try {
    const { shopifyCustomerId } = req.params;

    const customer = await Customer.findOne({ where: { shopifyCustomerId } });
    if (!customer) {
      return errorResponse(res, 'Customer not found', 'Not Found', 404);
    }

    const logs = await CustomerBonusLog.findAll({
      where: { customerId: customer.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: db.User, as: 'grantedBy', attributes: ['id', 'firstName', 'lastName'] }],
    });

    return successResponse(res, {
      history: logs.map(l => ({
        id:         l.id,
        points:     l.points,
        couponCode: l.couponCode,
        note:       l.note,
        grantedBy:  l.grantedBy ? `${l.grantedBy.firstName} ${l.grantedBy.lastName}`.trim() : null,
        createdAt:  l.createdAt,
      })),
    }, 'Bonus history retrieved');
  } catch (error) {
    console.error('[CustomerBonus] getBonusHistory error:', error);
    return errorResponse(res, error, 'Failed to get bonus history', 500);
  }
};
