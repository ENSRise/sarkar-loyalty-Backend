import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import {
  calcAvailableBalance,
  issueSettlementCoupon,
  SettlementError,
} from '../helpers/settlement.helper';

const Customer         = db.Customer;
const SettlementCoupon = db.SettlementCoupon;

// Find customer by last-10-digit phone match
const findCustomerByPhone = (phone) => {
  const last10 = String(phone).replace(/\D/g, '').slice(-10);
  return Customer.findOne({
    where: db.sequelize.where(
      db.sequelize.fn('RIGHT', db.sequelize.cast(db.sequelize.col('phone'), 'TEXT'), 10),
      last10
    ),
  });
};

/**
 * POST /api/settlement/settle
 * Body: { phone, amount } — amount must be a positive number not exceeding
 * the customer's available referral wallet balance. No fixed denominations:
 * the storefront/admin UI is free to offer quick-pick buttons (e.g. 200 /
 * 300 / 500 / "Total balance") — the backend only enforces amount <= balance.
 *
 * Merge-or-create logic (see settlement.helper.js issueSettlementCoupon):
 *  - If the customer already holds an unused settlement coupon, the
 *    requested amount is merged into it (same DB row, new code + combined
 *    value, old Shopify code voided).
 *  - Otherwise a brand-new coupon row is created for just this amount.
 */
export const settleAmount = async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone) {
      return errorResponse(res, 'phone is required', 'Bad Request', 400);
    }

    const settlementAmount = parseInt(amount, 10);
    if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) {
      return errorResponse(res, 'amount must be a positive number', 'Bad Request', 400);
    }

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return errorResponse(res, 'Customer not found for this phone number', 'Not Found', 404);
    }

    const result = await issueSettlementCoupon(customer.id, settlementAmount);

    const message = result.merged
      ? `Merged ₹${settlementAmount} into existing coupon — new coupon ${result.coupon.couponCode} for ₹${result.coupon.couponValue} generated`
      : `Settlement coupon ${result.coupon.couponCode} for ₹${settlementAmount} generated successfully`;

    return successResponse(res, {
      customer: {
        id:                customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        firstName:         customer.firstName,
        lastName:          customer.lastName,
        phone:             customer.phone,
        currentTier:       customer.currentTier,
      },
      settlement: {
        couponCode:         result.coupon.couponCode,
        couponValue:        parseFloat(result.coupon.couponValue),
        merged:             result.merged,
        previousCouponCode: result.previousCouponCode,
      },
      updatedReferralPart: result.updatedReferralPart,
      remainingBalance:    result.remainingBalance,
    }, message);

  } catch (error) {
    if (error instanceof SettlementError) {
      return errorResponse(res, error.message, 'Bad Request', error.statusCode);
    }
    console.error('[SettlementController] settleAmount error:', error);
    return errorResponse(res, error, 'Failed to process settlement', 500);
  }
};

/**
 * GET /api/settlement/status?phone=...
 * Returns the current settlement state of a customer (no writes).
 */
export const getSettlementStatus = async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return errorResponse(res, 'phone query param is required', 'Bad Request', 400);
    }

    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return errorResponse(res, 'Customer not found for this phone number', 'Not Found', 404);
    }

    const referralPart   = customer.customerReferralPart || [];
    const totalAvailable = calcAvailableBalance(referralPart);

    // Full settlement history for this customer — couponUsed is now stored
    // directly on each row (set by the order webhook), no need to cross-query
    // the orders table here.
    const history = await SettlementCoupon.findAll({
      where: { customerId: customer.id },
      order: [['createdAt', 'DESC']],
    });

    const settlementHistory = history.map(h => ({
      couponCode:  h.couponCode,
      couponValue: parseFloat(h.couponValue),
      used:        h.couponUsed,
      usedOrderId: h.usedOrderId,
      usedAt:      h.usedAt,
      createdAt:   h.createdAt,
    }));

    const activeCoupon = history.find(h => h.couponCode === customer.customerFinalCoupon);

    return successResponse(res, {
      customer: {
        id:                customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        firstName:         customer.firstName,
        lastName:          customer.lastName,
        phone:             customer.phone,
        currentTier:       customer.currentTier,
      },
      finalCoupon: {
        code:  customer.customerFinalCoupon || null,
        value: customer.customerFinalCouponValue || null,
        used:  activeCoupon ? activeCoupon.couponUsed : false,
      },
      totalAvailableBalance: totalAvailable,
      referralPart,
      settlementHistory,
    }, 'Settlement status retrieved');

  } catch (error) {
    console.error('[SettlementController] getSettlementStatus error:', error);
    return errorResponse(res, error, 'Failed to get settlement status', 500);
  }
};
