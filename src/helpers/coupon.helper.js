import db from '../models';

const Customer = db.Customer;
const Order    = db.Order;

/**
 * findCouponStatus(phone)
 *
 * Given a customer's phone number:
 *  1. Locates the customer by last-10-digit phone match.
 *  2. Fetches all their orders and collects every couponCode that was used.
 *  3. Walks each entry in customerReferralPart and stamps:
 *       coupon-status: "Used"   — if the coupon appears in the customer's orders
 *       coupon-status: "Unused" — if the coupon has been assigned but not yet used
 *       coupon-status: "Pending"— if no coupon has been assigned yet (couponCode is null)
 *  4. Persists the updated customerReferralPart back to the DB.
 *  5. Returns { customer, updatedReferralPart }.
 */
export const findCouponStatus = async (phone) => {
  if (!phone) throw new Error('Phone number is required');

  const last10 = String(phone).replace(/\D/g, '').slice(-10);
  if (last10.length < 10) throw new Error('Invalid phone number');

  // 1. Find customer by last 10 digits
  const customer = await Customer.findOne({
    where: db.sequelize.where(
      db.sequelize.fn('RIGHT', db.sequelize.cast(db.sequelize.col('phone'), 'TEXT'), 10),
      last10
    ),
  });

  if (!customer) throw new Error('Customer not found for this phone number');

  // 2. Fetch all orders for this customer
  const orders = await Order.findAll({
    where: { shopifyCustomerId: String(customer.shopifyCustomerId) },
    attributes: ['id', 'orderId', 'orderName', 'couponCode'],
  });

  // Build a set of coupon codes that appear in orders (case-insensitive)
  const usedCoupons = new Set(
    orders
      .map(o => o.couponCode)
      .filter(Boolean)
      .map(c => c.toUpperCase())
  );

  // 3. Tag each referral entry with coupon-status
  const referralPart = customer.customerReferralPart || [];

  const updatedReferralPart = referralPart.map(entry => {
    if (!entry.couponCode) {
      return { ...entry, 'coupon-status': 'Pending' };
    }
    const isUsed = usedCoupons.has(entry.couponCode.toUpperCase());
    return { ...entry, 'coupon-status': isUsed ? 'Used' : 'Unused' };
  });

  // 4. Persist back to DB
  await customer.update({ customerReferralPart: updatedReferralPart });

  return {
    customer: {
      id:               customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      firstName:        customer.firstName,
      lastName:         customer.lastName,
      phone:            customer.phone,
      currentTier:      customer.currentTier,
    },
    usedCouponCodes: [...usedCoupons],
    updatedReferralPart,
  };
};
