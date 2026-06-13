import db from '../models';
import { updateShopifyCustomerNote } from './shopify.helper';

const Customer = db.Customer;
const Order    = db.Order;
const TierInfo = db.TierInfo;

// Tier rank so we never downgrade a customer
const TIER_RANK = { silver: 0, gold: 1, platinum: 2 };

/**
 * Recalculates a customer's totalSpent, ordersCount, and tier
 * based on all their orders with status 'Credit'.
 *
 * @param {string|number} shopifyCustomerId
 * @returns {object} updated customer instance
 */
export const recalculateCustomerTier = async (shopifyCustomerId) => {
  const customerId = String(shopifyCustomerId);

  // 1. Find customer
  const customer = await Customer.findOne({ where: { shopifyCustomerId: customerId } });
  if (!customer) throw new Error(`Customer not found for shopifyCustomerId: ${customerId}`);

  const shopName = customer.shopName;

  // 2. Fetch all Credit-status orders for this customer
  const creditOrders = await Order.findAll({
    where: { shopifyCustomerId: customerId, orderStatus: 'Credit' }
  });

  // 3. Sum totalPrice across Credit orders
  const totalSpent = creditOrders.reduce(
    (sum, order) => sum + parseFloat(order.totalPrice || 0),
    0
  );

  // 4. Count Credit orders
  const ordersCount = creditOrders.length;

  // Always persist totalSpent + ordersCount
  await customer.update({
    totalSpent:  parseFloat(totalSpent.toFixed(2)),
    ordersCount
  });

  console.log(`[TierHelper] Customer ${customerId} — totalSpent: ${totalSpent}, orders: ${ordersCount}`);

  // 5. Fetch tier configuration for this shop
  const tierInfo = await TierInfo.findOne({ where: { shopName } });
  if (!tierInfo) {
    console.warn(`[TierHelper] No tier info found for shop: ${shopName}. Skipping tier update.`);
    return customer.reload();
  }

  const platinumThreshold = parseFloat(tierInfo.platinum.orderValue);
  const goldThreshold     = parseFloat(tierInfo.gold.orderValue);

  // 6. Determine the tier the customer qualifies for
  let qualifiedTier;
  let qualifiedBenefits;

  if (totalSpent >= platinumThreshold) {
    qualifiedTier     = 'platinum';
    qualifiedBenefits = tierInfo.platinum;
  } else if (totalSpent >= goldThreshold) {
    qualifiedTier     = 'gold';
    qualifiedBenefits = tierInfo.gold;
  } else {
    // Below gold threshold — no tier upgrade needed
    console.log(`[TierHelper] Customer ${customerId} below gold threshold (${goldThreshold}). No tier change.`);
    return customer.reload();
  }

  // 7. Only upgrade — never downgrade
  const currentRank   = TIER_RANK[customer.currentTier] ?? 0;
  const qualifiedRank = TIER_RANK[qualifiedTier];

  if (qualifiedRank <= currentRank) {
    console.log(`[TierHelper] Customer ${customerId} already at ${customer.currentTier}. No upgrade needed.`);
    return customer.reload();
  }

  // 8. Apply the upgrade
  await customer.update({
    currentTier:  qualifiedTier,
    tierBenefits: qualifiedBenefits
  });

  console.log(`[TierHelper] Customer ${customerId} upgraded: ${customer.currentTier} → ${qualifiedTier}`);

  // 9. Sync note back to Shopify customer profile (preserve existing referral pairs).
  // Best-effort — a Shopify API failure must not roll back the DB tier upgrade.
  try {
    await updateShopifyCustomerNote(customerId, qualifiedTier, customer.customerReferralPart || []);
  } catch (noteErr) {
    console.error(`[TierHelper] Shopify note update failed for customer ${customerId}:`, noteErr.message);
  }

  return customer.reload();
};
