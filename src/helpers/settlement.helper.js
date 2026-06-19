import { Op } from 'sequelize';
import db from '../models';
import {
  createShopifyDiscountCode,
  deactivateShopifyDiscountCode,
} from './shopify.helper';

const Customer         = db.Customer;
const SettlementCoupon = db.SettlementCoupon;

const COUPON_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export class SettlementError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SettlementError';
    this.statusCode = statusCode;
  }
}

export const generateCouponCode = (prefix = 'SET') => {
  let code = prefix;
  for (let i = 0; i < 6; i++) {
    code += COUPON_CODE_CHARS.charAt(Math.floor(Math.random() * COUPON_CODE_CHARS.length));
  }
  return code;
};

// Sum of remaining (unconsumed) referral-wallet balance across all coupon-bearing parts
export const calcAvailableBalance = (referralPart = []) =>
  referralPart
    .filter(e => e.couponCode)
    .reduce((sum, e) => {
      const available = parseFloat(
        e['remaining-amount'] !== undefined ? e['remaining-amount'] : (e.tierAmount ?? 0)
      );
      return sum + Math.max(0, available);
    }, 0);

// Greedily draws `amount` down from referralPart entries (array order = draw order),
// marking each Used / PartialUsed as it's consumed.
// Returns { updatedPart, remaining } — remaining > 0 means the wallet fell short.
export const consumeReferralWallet = (referralPart = [], amount) => {
  let remaining = amount;

  const updatedPart = referralPart.map(entry => {
    if (!entry.couponCode || remaining <= 0) return entry;

    const available = parseFloat(
      entry['remaining-amount'] !== undefined ? entry['remaining-amount'] : (entry.tierAmount ?? 0)
    );

    if (available <= 0) {
      return entry['coupon-status'] !== 'Used'
        ? { ...entry, 'remaining-amount': '0', 'coupon-status': 'Used' }
        : entry;
    }

    if (available <= remaining) {
      remaining -= available;
      return { ...entry, 'remaining-amount': '0', 'coupon-status': 'Used' };
    }

    const leftover = available - remaining;
    remaining = 0;
    return { ...entry, 'remaining-amount': String(leftover), 'coupon-status': 'PartialUsed' };
  });

  return { updatedPart, remaining };
};

/**
 * Issue (or top up) a settlement coupon for a customer.
 *
 *  Case 1 — customer already has an UNUSED settlement coupon:
 *    the requested amount is merged into it. A fresh Shopify discount code
 *    is created for the combined value, the SAME database row is updated in
 *    place (new couponCode + couponValue, couponUsed stays false), and the
 *    superseded Shopify code is best-effort deactivated so it can't also be
 *    redeemed.
 *
 *  Case 2 — no unused coupon (none yet, or the last one was already
 *    redeemed): a brand-new row + Shopify discount code is created for just
 *    the requested amount. The old, used row is left untouched as history.
 *
 *  In both cases customer.customerFinalCoupon / customerFinalCouponValue are
 *  updated to mirror whichever row is now the active (unused) one.
 *
 * @param {number} customerId - internal Customer.id (not the Shopify id)
 * @param {number} requestedAmount - amount to settle, must be > 0 and <= wallet balance
 */
export const issueSettlementCoupon = async (customerId, requestedAmount) => {
  return db.sequelize.transaction(async (t) => {
    // Lock the customer row so two concurrent settlement requests for the
    // same person can't both read the same wallet balance / active coupon.
    const customer = await Customer.findByPk(customerId, {
      transaction: t,
      lock: db.Sequelize.Transaction.LOCK.UPDATE,
    });
    if (!customer) throw new SettlementError('Customer not found', 404);

    const referralPart     = customer.customerReferralPart || [];
    const availableBalance = calcAvailableBalance(referralPart);

    if (requestedAmount > availableBalance) {
      throw new SettlementError(
        `Insufficient referral balance. Available: ₹${availableBalance}, requested: ₹${requestedAmount}.`
      );
    }

    const { updatedPart, remaining } = consumeReferralWallet(referralPart, requestedAmount);
    if (remaining > 0) {
      throw new SettlementError(`Insufficient referral balance. Short by ₹${remaining}.`);
    }

    // Most recent unused coupon for this customer, if any. Locked too, so a
    // second concurrent request can't merge into the same row twice.
    const activeCoupon = await SettlementCoupon.findOne({
      where: { customerId: customer.id, couponUsed: false },
      order: [['createdAt', 'DESC']],
      transaction: t,
      lock: db.Sequelize.Transaction.LOCK.UPDATE,
    });

    const merged     = !!activeCoupon;
    const finalValue = merged
      ? parseFloat(activeCoupon.couponValue) + requestedAmount
      : requestedAmount;

    const newCode = generateCouponCode();
    const title   = merged ? 'Settlement Top-up' : 'Settlement Reward';

    // Kept inside the transaction on purpose: the DB must only ever persist
    // a coupon that actually exists in Shopify. If this throws, the wallet
    // consumption above rolls back along with it.
    const discountNode = await createShopifyDiscountCode(
      customer.shopifyCustomerId,
      finalValue,
      newCode,
      title
    );

    let coupon;
    let previousCouponCode = null;

    if (merged) {
      previousCouponCode = activeCoupon.couponCode;
      const supersededNodeId = activeCoupon.shopifyDiscountNodeId;

      await activeCoupon.update({
        couponCode:             newCode,
        couponValue:            finalValue,
        shopifyDiscountNodeId:  discountNode?.id || null,
      }, { transaction: t });

      coupon = activeCoupon;

      // Best-effort, fire-and-forget — DB is already the source of truth for
      // "which code is valid"; this just closes the hole in Shopify too.
      if (supersededNodeId) {
        deactivateShopifyDiscountCode(supersededNodeId).catch(err =>
          console.error(`[Settlement] Failed to deactivate superseded code ${previousCouponCode}:`, err.message)
        );
      }
    } else {
      coupon = await SettlementCoupon.create({
        customerId:             customer.id,
        shopifyCustomerId:      customer.shopifyCustomerId,
        phone:                  customer.phone ? String(customer.phone) : null,
        email:                  customer.email,
        couponCode:             newCode,
        couponValue:            finalValue,
        couponUsed:             false,
        shopifyDiscountNodeId:  discountNode?.id || null,
      }, { transaction: t });
    }

    await customer.update({
      customerReferralPart:     updatedPart,
      customerFinalCoupon:      coupon.couponCode,
      customerFinalCouponValue: coupon.couponValue,
    }, { transaction: t });

    return {
      coupon,
      merged,
      previousCouponCode,
      updatedReferralPart: updatedPart,
      remainingBalance:    calcAvailableBalance(updatedPart),
    };
  });
};

/**
 * Called from the order/create webhook. Scans the order's discount_codes for
 * a match against an UNUSED settlement coupon belonging to the same Shopify
 * customer, and flips it to used + links the order. No-op (returns []) for
 * the common case where the order carries no settlement code at all — kept
 * cheap (single indexed query) since this runs on every order webhook.
 *
 * @param {object} params
 * @param {string} params.shopifyCustomerId
 * @param {Array}  params.discountCodes - Shopify's discount_codes array: [{code, amount, type}]
 * @param {string} params.orderId       - Shopify order id (Order.orderId)
 * @param {Date}   [params.orderCreatedAt]
 */
export const markSettlementCouponsUsedFromOrder = async ({
  shopifyCustomerId,
  discountCodes = [],
  orderId,
  orderCreatedAt,
}) => {
  if (!shopifyCustomerId || !discountCodes.length) return [];

  const codes = discountCodes.map(d => d.code).filter(Boolean).map(c => c.toUpperCase());
  if (!codes.length) return [];

  const matches = await SettlementCoupon.findAll({
    where: {
      shopifyCustomerId: String(shopifyCustomerId),
      couponCode: { [Op.in]: codes },
      couponUsed: false,
    },
  });

  for (const coupon of matches) {
    await coupon.update({
      couponUsed:  true,
      usedOrderId: orderId,
      usedAt:      orderCreatedAt || new Date(),
    });
  }

  return matches;
};
