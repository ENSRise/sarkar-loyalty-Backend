import { Op } from 'sequelize';
import db from '../models';
import { calcAvailableBalance } from './settlement.helper';

const Customer         = db.Customer;
const CustomerBonusLog = db.CustomerBonusLog;

const BONUS_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const generateBonusCouponCode = () => {
  let code = 'BNS';
  for (let i = 0; i < 6; i++) code += BONUS_CODE_CHARS.charAt(Math.floor(Math.random() * BONUS_CODE_CHARS.length));
  return code;
};

export const customerSummary = (customer) => ({
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
 * Resolves a customer from a single free-text identifier — treated as an
 * email if it contains "@", otherwise as a phone number (last-10-digit
 * match, same convention used across settlement/referral lookups).
 */
export const findCustomerByIdentifier = async (identifier) => {
  const value = String(identifier || '').trim();
  if (!value) return null;

  if (value.includes('@')) {
    return Customer.findOne({ where: { email: { [Op.iLike]: value } } });
  }

  const last10 = value.replace(/\D/g, '').slice(-10);
  if (last10.length !== 10) return null;

  return Customer.findOne({
    where: db.sequelize.where(
      db.sequelize.fn('RIGHT', db.sequelize.cast(db.sequelize.col('phone'), 'TEXT'), 10),
      last10
    ),
  });
};

/**
 * Grants `points` and/or saves a `note` for an already-resolved customer
 * (by internal id), recording one audit row in customer_bonus_logs.
 *
 * No Shopify API call is made here — the couponCode is an internal tracking
 * label only. The wallet entry it creates in customerReferralPart becomes
 * spendable through the existing settlement flow, where the one and only
 * real, redeemable Shopify coupon is actually created.
 *
 * Used by both the single-customer grant endpoint and the bulk CSV upload,
 * so the two paths can never drift out of sync with each other.
 */
export const grantBonusToCustomer = async ({ customerId, points, note, grantedByUserId }) => {
  return db.sequelize.transaction(async (t) => {
    const customer = await Customer.findByPk(customerId, {
      transaction: t,
      lock: db.Sequelize.Transaction.LOCK.UPDATE,
    });
    if (!customer) {
      const err = new Error('Customer not found');
      err.statusCode = 404;
      throw err;
    }

    let couponCode = null;

    if (points > 0) {
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
          tierAmount:         points,
          'remaining-amount': String(points),
          source:             'admin_bonus',
          grantedBy:          grantedByUserId,
          grantedAt:          new Date().toISOString(),
        },
      ];

      await customer.update({
        customerReferralPart: updatedPart,
        wallet: db.sequelize.literal(`wallet + ${points}`),
      }, { transaction: t });
    }

    const log = await CustomerBonusLog.create({
      customerId:        customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      points:            points > 0 ? points : null,
      couponCode,
      note:              note || null,
      grantedByUserId,
    }, { transaction: t });

    return { customer, log };
  });
};
