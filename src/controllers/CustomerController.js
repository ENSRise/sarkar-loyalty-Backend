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
import { removeInterest } from './InterestedCustomerController';
import { streamCSV, sendXLSX, sendCustomerXLSX, sendPDF } from '../helpers/export.helper';
import { findCouponStatus } from '../helpers/coupon.helper';

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

// ─── Export helpers ────────────────────────────────────────────────────────────

const fmtTierBenefits = (raw) => {
  if (!raw) return '';
  try {
    const b = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const parts = [];
    if (b.reward) parts.push(`Reward: ${b.reward}`);
    if (Array.isArray(b.additionReward) && b.additionReward.length)
      parts.push(b.additionReward.join(' | '));
    return parts.join(' — ');
  } catch { return String(raw); }
};

const fmtReferrals = (raw) => {
  if (!raw) return '';
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr.map(r => `${r.name || ''} (${r.phonenumber || ''}) Code:${r.couponCode || ''}`).join(' | ');
  } catch { return ''; }
};

const fmtDate = (val) => val ? String(val).split('T')[0] : '';

// ─── XLSX columns (full detail) ────────────────────────────────────────────────

const CUSTOMER_XLSX_COLUMNS = [
  { label: 'Shopify ID',        key: 'shopifyCustomerId', width: 22 },
  { label: 'First Name',        key: 'firstName',         width: 16 },
  { label: 'Last Name',         key: 'lastName',          width: 16 },
  { label: 'Email',             key: 'email',             width: 28 },
  { label: 'Phone',             key: 'phone',             width: 16 },
  { label: 'Current Tier',      key: 'currentTier',       width: 14 },
  { label: 'Tier Benefits',     key: 'tierBenefits',      width: 50, formatter: fmtTierBenefits },
  { label: 'Total Spent (₹)',   key: 'totalSpent',        width: 16 },
  { label: 'Orders (Credited)', key: 'ordersCount',       width: 18 },
  { label: 'Wallet Balance (₹)',key: 'wallet',            width: 18 },
  { label: 'Referral Count',    key: 'referralCount',     width: 15 },
  { label: 'Referred Customers',key: 'customerReferralPart', width: 60, formatter: fmtReferrals },
  { label: 'Birthday',          key: 'birthdayDate',      width: 14, formatter: fmtDate },
  { label: 'Anniversary',       key: 'anniversaryDate',   width: 14, formatter: fmtDate },
  { label: 'Joined At',         key: 'createdAt',         width: 20, formatter: fmtDate },
];

// ─── PDF columns (landscape printable subset) ─────────────────────────────────

const CUSTOMER_PDF_COLUMNS = [
  { label: 'First Name',    key: 'firstName',    weight: 1.0 },
  { label: 'Last Name',     key: 'lastName',     weight: 1.0 },
  { label: 'Email',         key: 'email',        weight: 1.8 },
  { label: 'Phone',         key: 'phone',        weight: 1.1 },
  { label: 'Tier',          key: 'currentTier',  weight: 0.8 },
  { label: 'Tier Benefits', key: 'tierBenefits', weight: 2.5, formatter: fmtTierBenefits },
  { label: 'Spent (₹)',     key: 'totalSpent',   weight: 0.9 },
  { label: 'Orders',        key: 'ordersCount',  weight: 0.6 },
  { label: 'Wallet (₹)',    key: 'wallet',        weight: 0.8 },
  { label: 'Referrals',     key: 'referralCount', weight: 0.7 },
  { label: 'Birthday',      key: 'birthdayDate',  weight: 0.9, formatter: fmtDate },
  { label: 'Joined At',     key: 'createdAt',     weight: 1.1, formatter: fmtDate },
];

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getCustomerStats = async (req, res) => {
  try {
    const fn   = Customer.sequelize.fn;
    const col  = Customer.sequelize.col;
    const cast = Customer.sequelize.cast;

    const [total, byTier, spentRow] = await Promise.all([
      Customer.count({}),
      Customer.findAll({
        attributes: ['currentTier', [fn('COUNT', col('id')), 'count']],
        group: ['currentTier'],
        raw: true,
      }),
      Customer.findOne({
        attributes: [[fn('SUM', cast(col('totalSpent'), 'FLOAT')), 'total']],
        raw: true,
      }),
    ]);

    const tierCounts = { silver: 0, gold: 0, platinum: 0 };
    byTier.forEach(r => {
      if (tierCounts[r.currentTier] !== undefined)
        tierCounts[r.currentTier] = parseInt(r.count);
    });

    return successResponse(res, {
      total,
      ...tierCounts,
      totalSpent: parseFloat(spentRow?.total || 0),
    }, 'Customer stats retrieved');
  } catch (error) {
    return errorResponse(res, error, 'Failed to get customer stats');
  }
};

export const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const where  = buildCustomerWhere(req.query);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Customer.findAndCountAll({
      where,
      order:  [['createdAt', 'DESC']],
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
    const { firstName, lastName, phone, email, birthdayDate, anniversaryDate, address } = req.body;
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
        await customer.update({
          email: email || customer.email || null,
          birthdayDate: birthdayDate || null,
          anniversaryDate: anniversaryDate || null
        });
        await removeInterest(phone);
        return successResponse(res, customer, 'Welcome back! Your loyalty profile has been updated.');
      }

      const tierInfo = await TierInfo.findOne({ where: { shopName } });
      const silverBenefits = tierInfo ? tierInfo.silver : null;
      const sanitizedPhone = String(normalizedPhone).replace(/\D/g, '') || null;

      customer = await Customer.create({
        shopifyCustomerId: shopifyId,
        shopName,
        email: email || shopifyCustomer.email || null,
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
      await removeInterest(phone);
      return successResponse(res, customer, 'You have been added to our loyalty program!', 201);
    }

    // Customer not in Shopify — create them (now includes email)
    const newShopifyCustomer = await createShopifyCustomer({ firstName, lastName, phone: normalizedPhone, email: email || null, address });
    const shopifyId = extractNumericId(newShopifyCustomer.id);

    const tierInfo = await TierInfo.findOne({ where: { shopName } });
    const silverBenefits = tierInfo ? tierInfo.silver : null;
    const sanitizedPhone = String(normalizedPhone).replace(/\D/g, '') || null;

    const customer = await Customer.create({
      shopifyCustomerId: shopifyId,
      shopName,
      email: email || null,
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
    await removeInterest(phone);
    return successResponse(res, customer, 'Welcome to our loyalty program!', 201);
  } catch (error) {
    console.error('Error in registerCustomer:', error);
    return errorResponse(res, error, 'Failed to register customer');
  }
};

export const exportCustomers = async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;
    const where   = buildCustomerWhere(req.query);
    const dbOrder = [['createdAt', 'DESC']];

    if (format === 'pdf') {
      const rows = await Customer.findAll({ where, order: dbOrder, raw: true });
      return sendPDF(res, 'customers.pdf', 'Customers Report', CUSTOMER_PDF_COLUMNS, rows);
    }

    // XLSX — two-sheet workbook: Customers + Referral Details
    const rows = await Customer.findAll({ where, order: dbOrder, raw: true });
    return sendCustomerXLSX(res, 'customers.xlsx', CUSTOMER_XLSX_COLUMNS, rows);
  } catch (error) {
    if (!res.headersSent) {
      return errorResponse(res, error, 'Failed to export customers');
    }
    console.error('Export error after headers sent:', error);
    res.end();
  }
};

export const getCouponStatus = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return errorResponse(res, 'phone is required', 'Bad Request', 400);
    }

    const result = await findCouponStatus(phone);
    return successResponse(res, result, 'Coupon status retrieved and updated successfully');
  } catch (error) {
    const isNotFound = error.message?.includes('not found') || error.message?.includes('Invalid phone');
    return errorResponse(res, error, error.message, isNotFound ? 404 : 500);
  }
};
