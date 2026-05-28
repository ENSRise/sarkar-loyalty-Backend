import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { updateShopifyCustomerNote } from '../helpers/shopify.helper';
import { recalculateCustomerTier } from '../helpers/tier.helper';

const Customer = db.Customer;
const TierInfo  = db.TierInfo;
const Order     = db.Order;

// Extract the precise Shopify order ID from the GID string to avoid JS BigInt precision loss.
// Shopify sends: admin_graphql_api_id = "gid://shopify/Order/820982911946154508"
const extractOrderId = (body) => {
  if (body.admin_graphql_api_id) {
    return body.admin_graphql_api_id.split('/').pop();
  }
  return String(body.id);
};

// Build a clean orderItems summary from Shopify line_items
const buildOrderItems = (lineItems = []) =>
  lineItems.map(item => ({
    name:     item.name || item.title,
    quantity: item.quantity,
    price:    item.price,
    sku:      item.sku || null,
    variantId: item.variant_id ? String(item.variant_id) : null
  }));

// Extract precise Shopify customer ID from the customer GID to avoid JS BigInt precision loss.
// customer.admin_graphql_api_id = "gid://shopify/Customer/115310627314723954"
const extractCustomerId = (body) => {
  const customer = body.customer;
  if (!customer) return null;
  if (customer.admin_graphql_api_id) {
    return customer.admin_graphql_api_id.split('/').pop();
  }
  return customer.id ? String(customer.id) : null;
};

// Calculate creditDay = baseDate + returnWindow days → "YYYY-MM-DD"
const calculateCreditDay = (baseDate, returnWindow = 10) => {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + parseInt(returnWindow));
  return date.toISOString().split('T')[0];
};

// Resolve customer phone: check customer, billing_address, shipping_address
const resolvePhone = (body) =>
  body.customer?.phone ||
  body.billing_address?.phone ||
  body.shipping_address?.phone ||
  null;

const sanitizePhone = (phone) => {
  if (!phone) return null;
  // Remove all non-numeric characters and convert to number
  const sanitized = String(phone).replace(/\D/g, '');
  return sanitized || null;
};

export const createCustomer = async (req, res) => {
  try {
    // In Shopify webhooks, the customer data is often at the root of the body
    const customerData = req.body;
    const {  id, email, first_name, last_name, phone, addresses, default_address } = customerData;
    const domain = process.env.shopName;

    console.log('Webhook - Create Customer (Root Body):', customerData);  

    if (!id) {
      return errorResponse(res, 'Customer ID is missing', 'Bad Request', 400);
    }

    const shopName = domain || 'unknown-shop';
    console.log('Shop Name from Webhook:', shopName);

    // Shopify provides phone in various places
    const rawPhone = phone || 
                     (addresses && addresses[0] ? addresses[0].phone : null) || 
                     (default_address ? default_address.phone : null);

    const sanitizedPhone = sanitizePhone(rawPhone);
    console.log('Sanitized Phone:', sanitizedPhone);

    // Check if customer already exists
    let existingCustomer = await Customer.findOne({ 
      where: { shopifyCustomerId: id } 
    });

    if (existingCustomer) {
      return successResponse(res, existingCustomer, 'Customer already exists, ignoring create webhook');
    }

    // Fetch Tier Information for this shop to get default 'silver' benefits
    const tierInfo = await TierInfo.findOne({ where: { shopName } });
    const silverBenefits = tierInfo ? tierInfo.silver : null;

    // Create new customer
    const newCustomer = await Customer.create({
      shopifyCustomerId: id,
      shopName: shopName,
      email: email,
      phone: sanitizedPhone,
      firstName: first_name,
      lastName: last_name,
      totalSpent: 0.00,
      ordersCount: 0,
      currentTier: 'silver',
      tierBenefits: silverBenefits
    });

    console.log('New Customer Created:', newCustomer.shopifyCustomerId);
    await updateShopifyCustomerNote(id, 'silver');
    return successResponse(res, newCustomer, 'Customer created successfully', 201);
  } catch (error) {
    console.error('Error in createCustomer Webhook:', error);
    return errorResponse(res, error, 'Failed to process create customer webhook');
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const customerData = req.body;
    const { id, email, first_name, last_name, phone, addresses, default_address } = customerData;
    const shopName = process.env.shopName;

    console.log('Webhook - Update Customer:', customerData);
    console.log('Shop Name from Webhook:', shopName);

    if (!id) {
      return errorResponse(res, 'Customer ID is missing', 'Bad Request', 400);
    }

    const existingCustomer = await Customer.findOne({
      where: { shopifyCustomerId: id, shopName }
    });

    if (!existingCustomer) {
      return errorResponse(res, 'Customer not found', 'Not Found', 404);
    }

    const rawPhone = phone ||
                     (addresses && addresses[0] ? addresses[0].phone : null) ||
                     (default_address ? default_address.phone : null);

    const sanitizedPhone = sanitizePhone(rawPhone);

    await existingCustomer.update({
      email,
      phone: sanitizedPhone,
      firstName: first_name,
      lastName: last_name,
    });

    console.log('Customer Updated:', existingCustomer.shopifyCustomerId);
    return successResponse(res, existingCustomer, 'Customer updated successfully');
  } catch (error) {
    console.error('Error in updateCustomer Webhook:', error);
    return errorResponse(res, error, 'Failed to process update customer webhook');
  }
};

export const createOrder = async (req, res) => {
  try {
    const body     = req.body;
    const orderId  = extractOrderId(body);
    const shopName = process.env.shopName;

    console.log('Webhook - Create Order:', orderId);

    // Idempotency: if order already exists, skip
    const existing = await Order.findOne({ where: { orderId } });
    if (existing) {
      return successResponse(res, existing, 'Order ID already exists, skipping duplicate webhook');
    }

    const customer     = body.customer || {};
    const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
                         body.billing_address?.name || null;

    const newOrder = await Order.create({
      orderId,
      shopName,
      orderName:         body.name || null,
      shopifyCustomerId: extractCustomerId(body),
      customerName,
      customerEmail:  body.email || customer.email || null,
      customerPhone:  resolvePhone(body),
      totalPrice:     parseFloat(body.total_price    || 0),
      totalTax:       parseFloat(body.total_tax      || 0),
      totalDiscounts: parseFloat(body.total_discounts || 0),
      orderItems:     buildOrderItems(body.line_items),
      shippingLines:  body.shipping_lines || [],
      lineItems:      body.line_items     || [],
      orderStatus:    'Hold',
      returnWindow:   10,
      creditDay:      calculateCreditDay(new Date(), 10)
    });

    console.log('Order created:', orderId);
    return successResponse(res, newOrder, 'Order created successfully', 201);
  } catch (error) {
    console.error('Error in createOrder Webhook:', error);
    return errorResponse(res, error, 'Failed to process create order webhook');
  }
};

export const updateOrder = async (req, res) => {
  try {
    const body     = req.body;
    const orderId  = extractOrderId(body);
    const custId   = extractCustomerId(body);

    console.log('Webhook - Update Order (tier recalc):', orderId);
    console.log('Extracted Customer ID for Tier Recalculation:', custId);
    

    if (!custId) {
      return errorResponse(res, 'Customer ID missing in webhook payload', 'Bad Request', 400);
    }

    const updatedCustomer = await recalculateCustomerTier(custId);

    console.log('Tier recalculated for customer:', custId);
    return successResponse(res, updatedCustomer, 'Customer tier recalculated successfully');
  } catch (error) {
    console.error('Error in updateOrder Webhook:', error);
    return errorResponse(res, error, 'Failed to process update order webhook');
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const body    = req.body;
    const orderId = extractOrderId(body);

    console.log('Webhook - Cancel Order:', orderId);

    const existing = await Order.findOne({ where: { orderId } });

    if (!existing) {
      return errorResponse(res, 'Order not found', 'Not Found', 404);
    }

    if (existing.orderStatus === 'Cancel') {
      return errorResponse(res, 'Order is already cancelled', 'Conflict', 409);
    }

    await existing.update({ orderStatus: 'Cancel' });

    console.log('Order cancelled:', orderId);
    return successResponse(res, existing, 'Order cancelled successfully');
  } catch (error) {
    console.error('Error in cancelOrder Webhook:', error);
    return errorResponse(res, error, 'Failed to process cancel order webhook');
  }
};
