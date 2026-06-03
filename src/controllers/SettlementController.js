import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { createShopifyDiscountCode } from '../helpers/shopify.helper';

const Customer = db.Customer;
const Order    = db.Order;

const ALLOWED_AMOUNTS = [200, 400, 600];

const generateCouponCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'SET';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

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
 * Body: { phone, amount }   — amount must be 200 | 400 | 600
 *
 * Flow:
 *  1. Find customer by phone.
 *  2. Block if customerFinalCoupon already exists (pending or used).
 *  3. Walk customerReferralPart entries (with couponCode assigned), consume `amount`
 *     greedily — update remaining-amount + coupon-status per entry.
 *  4. Create a Shopify discount code for the full settlement amount.
 *  5. Save customerFinalCoupon + customerFinalCouponValue + updated referralPart.
 */
export const settleAmount = async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone) {
      return errorResponse(res, 'phone is required', 'Bad Request', 400);
    }

    const settlementAmount = parseInt(amount, 10);
    if (!ALLOWED_AMOUNTS.includes(settlementAmount)) {
      return errorResponse(
        res,
        `amount must be one of: ${ALLOWED_AMOUNTS.join(', ')}`,
        'Bad Request',
        400
      );
    }

    // ── 1. Find customer ──────────────────────────────────────────────
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return errorResponse(res, 'Customer not found for this phone number', 'Not Found', 404);
    }

    // ── 2. Guard: final coupon already exists ─────────────────────────
    if (customer.customerFinalCoupon) {
      // Check if it has been used in an order
      const usedInOrder = await Order.findOne({
        where: {
          shopifyCustomerId: String(customer.shopifyCustomerId),
          couponCode:        customer.customerFinalCoupon,
        },
      });

      return errorResponse(
        res,
        {
          coupon:  customer.customerFinalCoupon,
          value:   customer.customerFinalCouponValue,
          usedInOrder: !!usedInOrder,
        },
        usedInOrder
          ? 'Settlement coupon already used in an order. Cannot generate a new one.'
          : 'Settlement coupon already generated but not yet used. Cannot generate a new one.',
        409
      );
    }

    // ── 3. Consume settlementAmount from referral parts ───────────────
    const referralPart = customer.customerReferralPart || [];

    let remaining = settlementAmount;
    const updatedPart = referralPart.map(entry => {
      // Skip entries with no coupon assigned (Pending) or already fully consumed
      if (!entry.couponCode || remaining <= 0) return entry;

      // current available = remaining-amount if set, else full tierAmount
      const available = parseFloat(
        entry['remaining-amount'] !== undefined
          ? entry['remaining-amount']
          : (entry.tierAmount ?? 0)
      );

      if (available <= 0) {
        // Already exhausted — normalize stale PartialUsed to Used
        return entry['coupon-status'] !== 'Used'
          ? { ...entry, 'remaining-amount': '0', 'coupon-status': 'Used' }
          : entry;
      }

      if (available <= remaining) {
        // Fully consumed
        remaining -= available;
        return { ...entry, 'remaining-amount': '0', 'coupon-status': 'Used' };
      } else {
        // Partially consumed — amount left over
        const leftover = available - remaining;
        remaining = 0;
        return { ...entry, 'remaining-amount': String(leftover), 'coupon-status': 'PartialUsed' };
      }
    });

    if (remaining > 0) {
      return errorResponse(
        res,
        `Insufficient referral balance. Short by ₹${remaining} (only ₹${settlementAmount - remaining} available).`,
        'Bad Request',
        400
      );
    }

    // ── 4. Create Shopify discount code ───────────────────────────────
    const couponCode = generateCouponCode();
    await createShopifyDiscountCode(customer.shopifyCustomerId, settlementAmount, couponCode);

    // ── 5. Persist all changes atomically ─────────────────────────────
    await customer.update({
      customerFinalCoupon:      couponCode,
      customerFinalCouponValue: settlementAmount,
      customerReferralPart:     updatedPart,
    });

    return successResponse(res, {
      customer: {
        id:               customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        firstName:        customer.firstName,
        lastName:         customer.lastName,
        phone:            customer.phone,
        currentTier:      customer.currentTier,
      },
      settlement: {
        couponCode,
        couponValue:      settlementAmount,
      },
      updatedReferralPart: updatedPart,
    }, `Settlement coupon ${couponCode} for ₹${settlementAmount} generated successfully`);

  } catch (error) {
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

    // Check if final coupon was used in an order
    let finalCouponUsed = false;
    if (customer.customerFinalCoupon) {
      const order = await Order.findOne({
        where: {
          shopifyCustomerId: String(customer.shopifyCustomerId),
          couponCode:        customer.customerFinalCoupon,
        },
      });
      finalCouponUsed = !!order;
    }

    // Calculate total available balance from referral parts
    const referralPart = customer.customerReferralPart || [];
    const totalAvailable = referralPart
      .filter(e => e.couponCode)
      .reduce((sum, e) => {
        const available = parseFloat(
          e['remaining-amount'] !== undefined ? e['remaining-amount'] : (e.tierAmount ?? 0)
        );
        return sum + Math.max(0, available);
      }, 0);

    return successResponse(res, {
      customer: {
        id:               customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        firstName:        customer.firstName,
        lastName:         customer.lastName,
        phone:            customer.phone,
        currentTier:      customer.currentTier,
      },
      finalCoupon: {
        code:   customer.customerFinalCoupon || null,
        value:  customer.customerFinalCouponValue || null,
        used:   finalCouponUsed,
      },
      totalAvailableBalance: totalAvailable,
      referralPart,
    }, 'Settlement status retrieved');

  } catch (error) {
    console.error('[SettlementController] getSettlementStatus error:', error);
    return errorResponse(res, error, 'Failed to get settlement status', 500);
  }
};
