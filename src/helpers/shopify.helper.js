import db from '../models';

const TierInfo = db.TierInfo;

console.log("line 5",process.env.shopName)
console.log("line 6",process.env.accessToken)


// Normalize phone to E.164 — defaults to +91 country code for India
export const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits;
  if (digits.length === 10) return '+91' + digits;
  return '+' + digits;
};

// Extract numeric ID from Shopify GID: "gid://shopify/Customer/12345" → "12345"
export const extractNumericId = (gid) => String(gid).split('/').pop();

/**
 * Search Shopify for a customer by phone number (E.164 format).
 * Returns the customer node or null if not found.
 */
export const searchShopifyCustomerByPhone = async (phone) => {
  const shopDomain = process.env.shopName;
  const accessToken = process.env.accessToken;

  const query = `
    query searchCustomer($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent { amount }
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables: { query: `phone:${phone}` } }),
    }
  );

  const json = await response.json();
  const edges = json?.data?.customers?.edges || [];
  return edges.length > 0 ? edges[0].node : null;
};

/**
 * Create a new customer in Shopify via GraphQL.
 * Returns the created customer object or throws on error.
 */
export const createShopifyCustomer = async ({ firstName, lastName, phone, email, address }) => {
  const shopDomain = process.env.shopName;
  const accessToken = process.env.accessToken;

  const addressInput = address
    ? [{ address1: address, country: 'IN' }]
    : undefined;

  const mutation = `
    mutation customerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id firstName lastName email phone numberOfOrders amountSpent { amount } }
        userErrors { field message }
      }
    }
  `;

  const input = { firstName, lastName, phone };
  if (email) input.email = email;
  if (addressInput) input.addresses = addressInput;

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: mutation, variables: { input } }),
    }
  );

  const json = await response.json();
  const userErrors = json?.data?.customerCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map(e => e.message).join(', '));
  }

  return json?.data?.customerCreate?.customer;
};

/**
 * Fetches tier benefits for a given tier from the DB.
 * @param {string} tier - 'silver' | 'gold' | 'platinum'
 * @returns {object|null} benefits object or null
 */
export const getTierBenefits = async (tier) => {
  const shopName = process.env.shopName;
  const tierInfo = await TierInfo.findOne({ where: { shopName } });
  if (!tierInfo) return null;
  return tierInfo[tier] || null;
};

/**
 * Updates the Shopify customer note AND tags with their tier info and referral pairs.
 * Note  — human-readable tier benefits string (visible in Shopify admin).
 * Tags  — set to the tier name so the customer is tagged e.g. "Silver", "Gold", "Platinum".
 *
 * @param {string} shopifyCustomerId - numeric Shopify customer ID
 * @param {string} tier              - 'silver' | 'gold' | 'platinum'
 * @param {Array}  referralParts     - array of {couponCode, phonenumber} to append to the note
 */
export const updateShopifyCustomerNote = async (shopifyCustomerId, tier, referralParts = []) => {
  const benefits = await getTierBenefits(tier);
  if (!benefits) {
    console.warn(`[Shopify] No TierInfo in DB for tier "${tier}" — note not updated for customer ${shopifyCustomerId}`);
    return null;
  }

  // ── Build note ────────────────────────────────────────────────────────────
  let note = [
    `Tier: ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
    `Reward: ${benefits.reward}`,
    `Additional Benefits: ${benefits.additionReward.join(', ')}`,
  ].join(' | ');

  if (referralParts.length > 0) {
    const referralStr = referralParts
      .filter(r => r.couponCode && r.phonenumber)
      .map(r => `${r.couponCode},${r.phonenumber}`)
      .join(' ');
    if (referralStr) note += ' ' + referralStr;
  }

  // ── Build tags — tier name as a tag (capitalised) ─────────────────────────
  const tierTag = tier.charAt(0).toUpperCase() + tier.slice(1); // "Silver" | "Gold" | "Platinum"

  const shopDomain  = process.env.shopName;
  console.log("shopDomain",shopDomain)
  console.log(`[Shopify] Updating customer ${shopifyCustomerId} — setting note: "${note}" and tag: "${tierTag}"`);
  const accessToken = process.env.accessToken;
  console.log("accessToken",accessToken)

  const gid = `gid://shopify/Customer/${shopifyCustomerId}`;

  const query = `
    mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer { id firstName lastName note tags }
        userErrors { field message }
      }
    }
  `;

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query,
        variables: { input: { id: gid, note, tags: [tierTag] } },
      }),
    }
  );

  const json = await response.json();

  // Top-level GraphQL errors (auth failure, schema issue, etc.)
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map(e => e.message).join(', ');
    console.error('[Shopify] customerUpdate GraphQL errors:', msg);
    throw new Error(msg);
  }

  const userErrors = json?.data?.customerUpdate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map(e => e.message).join(', '));
  }

  return json?.data?.customerUpdate?.customer;
};

/**
 * Creates a one-time discount code in Shopify (usable by all customers — code is secret by design).
 * @param {string} shopifyCustomerId - numeric Shopify customer ID (kept for future use / logging)
 * @param {number} amount - discount amount in INR
 * @param {string} code - the discount code string (e.g. "REFABC123")
 */
export const createShopifyDiscountCode = async (shopifyCustomerId, amount, code) => {
  const shopDomain = process.env.shopName;
  const accessToken = process.env.accessToken;

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              codes(first: 1) {
                edges { node { code } }
              }
            }
          }
        }
        userErrors {
          field
          code
          message
        }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: `Referral Reward - ${code}`,
      code,
      startsAt: new Date().toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerSelection: { all: true },
      customerGets: {
        value: {
          discountAmount: {
            amount: parseFloat(amount).toFixed(2),
            appliesOnEachItem: false,
          },
        },
        items: { all: true },
      },
    },
  };

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: mutation, variables }),
    }
  );

  const json = await response.json();

  // Top-level GraphQL errors (schema / auth issues)
  if (json.errors && json.errors.length > 0) {
    const msg = json.errors.map(e => e.message).join(', ');
    console.error('[Shopify] discountCodeBasicCreate GraphQL errors:', msg);
    throw new Error(msg);
  }

  const userErrors = json?.data?.discountCodeBasicCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    const msg = userErrors.map(e => `${e.code}: ${e.message}`).join(', ');
    console.error('[Shopify] discountCodeBasicCreate userErrors:', msg);
    throw new Error(msg);
  }

  const node = json?.data?.discountCodeBasicCreate?.codeDiscountNode;
  console.log(`[Shopify] Discount code created — code: ${code}, node id: ${node?.id}`);
  return node;
};
