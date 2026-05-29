import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { Op } from 'sequelize';
import {
  normalizePhone,
  extractNumericId,
  searchShopifyCustomerByPhone,
  createShopifyCustomer,
  updateShopifyCustomerNote
} from '../helpers/shopify.helper';
import { streamCSV, sendPDF } from '../helpers/export.helper';

const Customer = db.Customer;
const TierInfo  = db.TierInfo;
const Order     = db.Order;

// ─── Shared WHERE builder ──────────────────────────────────────────────────────

const buildCustomerWhere = (query) => {
  const { shopName, tier, minSpent, maxSpent, search, startDate, endDate } = query;
  const where = {};

  if (shopName) where.shopName    = shopName;
  if (tier)     where.currentTier = tier;

  if (minSpent || maxSpent) {
    where.totalSpent = {};
    if (minSpent) where.totalSpent[Op.gte] = parseFloat(minSpent);
    if (maxSpent) where.totalSpent[Op.lte] = parseFloat(maxSpent);
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate + 'T00:00:00.000Z');
    if (endDate)   where.createdAt[Op.lte] = new Date(endDate   + 'T23:59:59.999Z');
  }

  if (search) {
    where[Op.or] = [
      { firstName: { [Op.iLike]: `%${search}%` } },
      { lastName:  { [Op.iLike]: `%${search}%` } },
      { email:     { [Op.iLike]: `%${search}%` } }
    ];
  }

  return where;
};

// ─── Export column definitions ─────────────────────────────────────────────────

const CUSTOMER_CSV_COLUMNS = [
  { label: 'Shopify Customer ID', key: 'shopifyCustomerId' },
  { label: 'Shop Name',           key: 'shopName' },
  { label: 'First Name',          key: 'firstName' },
  { label: 'Last Name',           key: 'lastName' },
  { label: 'Email',               key: 'email' },
  { label: 'Phone',               key: 'phone' },
  { label: 'Total Spent',         key: 'totalSpent' },
  { label: 'Orders Count',        key: 'ordersCount' },
  { label: 'Current Tier',        key: 'currentTier' },
  { label: 'Birthday',            key: 'birthdayDate' },
  { label: 'Anniversary',         key: 'anniversaryDate' },
  { label: 'Joined At',           key: 'createdAt' }
];

const CUSTOMER_PDF_COLUMNS = [
  { label: 'First Name',    key: 'firstName',    weight: 1.0 },
  { label: 'Last Name',     key: 'lastName',     weight: 1.0 },
  { label: 'Email',         key: 'email',        weight: 2.0 },
  { label: 'Phone',         key: 'phone',        weight: 1.2 },
  { label: 'Total Spent',   key: 'totalSpent',   weight: 1.0 },
  { label: 'Orders',        key: 'ordersCount',  weight: 0.7 },
  { label: 'Tier',          key: 'currentTier',  weight: 0.8 },
  { label: 'Joined At',     key: 'createdAt',    weight: 1.3 }
];

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const where  = buildCustomerWhere(req.query);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Customer.findAndCountAll({
      where,
      order:  [['totalSpent', 'DESC']],
      limit:  parseInt(limit),
      offset
    });

    return successResponse(res, {
      customers: rows,
      total:     count,
      page:      parseInt(page),
      pages:     Math.ceil(count / parseInt(limit))
    }, 'Customers retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve customers');
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findOne({
      where: { shopifyCustomerId: id }
    });

    if (!customer) {
      return errorResponse(res, 'Customer not found', 'Not Found', 404);
    }

    return successResponse(res, customer, 'Customer retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve customer');
  }
};

export const getCustomerOrders = async (req, res) => {
  try {
    const { shopifyCustomerId } = req.params;
    const customer = await Customer.findOne({ where: { shopifyCustomerId } });
    if (!customer) {
      return errorResponse(res, 'Customer not found', 'Not Found', 404);
    }
    const orders = await Order.findAll({
      where: { shopifyCustomerId: String(shopifyCustomerId) },
      order: [['createdAt', 'DESC']]
    });
    return successResponse(res, { customer, orders }, 'Customer profile retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve customer profile');
  }
};

export const registerCustomer = async (req, res) => {
  try {
    const { firstName, lastName, phone, birthdayDate, anniversaryDate, address } = req.body;
    console.log('Registering customer with data:', req.body);
    if (!phone) {
      return errorResponse(res, 'Phone number is required', 'Bad Request', 400);
    }

    const normalizedPhone = normalizePhone(phone);
    const shopName = process.env.shopName;

    const shopifyCustomer = await searchShopifyCustomerByPhone(normalizedPhone);

    if (shopifyCustomer) {
      const shopifyId = extractNumericId(shopifyCustomer.id);
      let customer = await Customer.findOne({ where: { shopifyCustomerId: shopifyId } });

      if (customer) {
        await customer.update({ birthdayDate: birthdayDate || null, anniversaryDate: anniversaryDate || null });
        return successResponse(res, customer, 'Welcome back! Your loyalty profile has been updated.');
      }

      const tierInfo = await TierInfo.findOne({ where: { shopName } });
      const silverBenefits = tierInfo ? tierInfo.silver : null;
      const sanitizedPhone = String(normalizedPhone).replace(/\D/g, '') || null;

      customer = await Customer.create({
        shopifyCustomerId: shopifyId,
        shopName,
        email: shopifyCustomer.email || null,
        phone: sanitizedPhone,
        firstName: shopifyCustomer.firstName || firstName,
        lastName: shopifyCustomer.lastName || lastName,
        totalSpent: parseFloat(shopifyCustomer.amountSpent?.amount || 0),
        ordersCount: shopifyCustomer.numberOfOrders || 0,
        currentTier: 'silver',
        tierBenefits: silverBenefits,
        birthdayDate: birthdayDate || null,
        anniversaryDate: anniversaryDate || null
      });

      await updateShopifyCustomerNote(shopifyId, 'silver');
      return successResponse(res, customer, 'You have been added to our loyalty program!', 201);
    }

    const newShopifyCustomer = await createShopifyCustomer({ firstName, lastName, phone: normalizedPhone, address });
    const shopifyId = extractNumericId(newShopifyCustomer.id);

    const tierInfo = await TierInfo.findOne({ where: { shopName } });
    const silverBenefits = tierInfo ? tierInfo.silver : null;
    const sanitizedPhone = String(normalizedPhone).replace(/\D/g, '') || null;

    const customer = await Customer.create({
      shopifyCustomerId: shopifyId,
      shopName,
      email: null,
      phone: sanitizedPhone,
      firstName,
      lastName,
      totalSpent: 0,
      ordersCount: 0,
      currentTier: 'silver',
      tierBenefits: silverBenefits,
      birthdayDate: birthdayDate || null,
      anniversaryDate: anniversaryDate || null
    });

    await updateShopifyCustomerNote(shopifyId, 'silver');
    return successResponse(res, customer, 'Welcome to our loyalty program!', 201);
  } catch (error) {
    console.error('Error in registerCustomer:', error);
    return errorResponse(res, error, 'Failed to register customer');
  }
};

export const exportCustomers = async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const where   = buildCustomerWhere(req.query);
    const dbOrder = [['totalSpent', 'DESC']];

    if (format === 'pdf') {
      const rows = await Customer.findAll({ where, order: dbOrder, raw: true });
      return sendPDF(res, 'customers.pdf', 'Customers Report', CUSTOMER_PDF_COLUMNS, rows);
    }

    // CSV — batch-streamed to handle millions of rows without OOM
    await streamCSV(
      res,
      'customers.csv',
      CUSTOMER_CSV_COLUMNS,
      (limit, offset) => Customer.findAll({ where, order: dbOrder, limit, offset, raw: true })
    );
  } catch (error) {
    if (!res.headersSent) {
      return errorResponse(res, error, 'Failed to export customers');
    }
    console.error('Export error after headers sent:', error);
    res.end();
  }
};
