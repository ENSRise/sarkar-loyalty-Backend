import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { Op } from 'sequelize';
import { streamCSV, sendPDF } from '../helpers/export.helper';
import { recalculateCustomerTier } from '../helpers/tier.helper';

const Order = db.Order;

const calculateCreditDay = (baseDate, returnWindow) => {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + parseInt(returnWindow));
  return date.toISOString().split('T')[0];
};

// ─── Shared WHERE builder ──────────────────────────────────────────────────────

const buildOrderWhere = (query) => {
  const { shopName, status, shopifyCustomerId, search, startDate, endDate } = query;
  const where = {};

  if (shopName)          where.shopName         = shopName;
  if (status)            where.orderStatus      = status;
  if (shopifyCustomerId) where.shopifyCustomerId = shopifyCustomerId;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate + 'T00:00:00.000Z');
    if (endDate)   where.createdAt[Op.lte] = new Date(endDate   + 'T23:59:59.999Z');
  }

  if (search) {
    where[Op.or] = [
      { orderName:     { [Op.iLike]: `%${search}%` } },
      { orderId:       { [Op.iLike]: `%${search}%` } },
      { customerName:  { [Op.iLike]: `%${search}%` } },
      { customerEmail: { [Op.iLike]: `%${search}%` } },
      { customerPhone: { [Op.iLike]: `%${search}%` } }
    ];
  }

  return where;
};

// ─── Export column definitions ─────────────────────────────────────────────────

const ORDER_CSV_COLUMNS = [
  { label: 'Order ID',      key: 'orderId' },
  { label: 'Order Name',    key: 'orderName' },
  { label: 'Customer Name', key: 'customerName' },
  { label: 'Email',         key: 'customerEmail' },
  { label: 'Phone',         key: 'customerPhone' },
  { label: 'Total Price',   key: 'totalPrice' },
  { label: 'Tax',           key: 'totalTax' },
  { label: 'Discounts',     key: 'totalDiscounts' },
  { label: 'Status',        key: 'orderStatus' },
  { label: 'Return Window', key: 'returnWindow' },
  { label: 'Credit Day',    key: 'creditDay' },
  { label: 'Created At',    key: 'createdAt' }
];

const ORDER_PDF_COLUMNS = [
  { label: 'Order Name',    key: 'orderName',    weight: 1.2 },
  { label: 'Customer',      key: 'customerName', weight: 1.4 },
  { label: 'Email',         key: 'customerEmail',weight: 1.8 },
  { label: 'Phone',         key: 'customerPhone',weight: 1.2 },
  { label: 'Total (₹)',     key: 'totalPrice',   weight: 0.9 },
  { label: 'Status',        key: 'orderStatus',  weight: 0.8 },
  { label: 'Credit Day',    key: 'creditDay',    weight: 1.0 },
  { label: 'Created At',    key: 'createdAt',    weight: 1.2 }
];

// ─── Controllers ──────────────────────────────────────────────────────────────

export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const where  = buildOrderWhere(req.query);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Order.findAndCountAll({
      where,
      order:  [['createdAt', 'DESC']],
      limit:  parseInt(limit),
      offset
    });

    return successResponse(res, {
      orders: rows,
      total:  count,
      page:   parseInt(page),
      pages:  Math.ceil(count / parseInt(limit))
    }, 'Orders retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve orders');
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ where: { orderId } });

    if (!order) {
      return errorResponse(res, 'Order not found', 'Not Found', 404);
    }

    return successResponse(res, order, 'Order retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve order');
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId }     = req.params;
    const { orderStatus } = req.body;

    if (!['Hold', 'Cancel', 'Credit'].includes(orderStatus)) {
      return errorResponse(res, 'Invalid status. Must be Hold, Cancel, or Credit', 'Bad Request', 400);
    }

    const order = await Order.findOne({ where: { orderId } });
    if (!order) {
      return errorResponse(res, 'Order not found', 'Not Found', 404);
    }

    await order.update({ orderStatus });
    return successResponse(res, order, `Order status updated to ${orderStatus}`);
  } catch (error) {
    return errorResponse(res, error, 'Failed to update order status');
  }
};

export const updateReturnWindow = async (req, res) => {
  try {
    const { orderId }      = req.params;
    const { returnWindow } = req.body;

    const days = parseInt(returnWindow);
    if (isNaN(days) || days < 0) {
      return errorResponse(res, 'returnWindow must be a non-negative integer', 'Bad Request', 400);
    }

    const order = await Order.findOne({ where: { orderId } });
    if (!order) {
      return errorResponse(res, 'Order not found', 'Not Found', 404);
    }

    const creditDay = calculateCreditDay(order.createdAt, days);
    await order.update({ returnWindow: days, creditDay });
    return successResponse(res, order, `Return window updated to ${days} days (credit day: ${creditDay})`);
  } catch (error) {
    return errorResponse(res, error, 'Failed to update return window');
  }
};

export const getOrderAnalytics = async (req, res) => {
  try {
    const fn   = Order.sequelize.fn;
    const col  = Order.sequelize.col;
    const cast = Order.sequelize.cast;

    const rows = await Order.findAll({
      attributes: [
        'orderStatus',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', cast(col('totalPrice'), 'FLOAT')), 'revenue']
      ],
      group: ['orderStatus'],
      raw:   true
    });

    const stats = {
      Hold:   { count: 0, revenue: 0 },
      Cancel: { count: 0, revenue: 0 },
      Credit: { count: 0, revenue: 0 }
    };

    rows.forEach(r => {
      if (stats[r.orderStatus]) {
        stats[r.orderStatus].count   = parseInt(r.count);
        stats[r.orderStatus].revenue = parseFloat(r.revenue || 0);
      }
    });

    const totalCount   = Object.values(stats).reduce((s, v) => s + v.count,   0);
    const totalRevenue = Object.values(stats).reduce((s, v) => s + v.revenue, 0);

    return successResponse(res, {
      ...stats,
      total: { count: totalCount, revenue: parseFloat(totalRevenue.toFixed(2)) }
    }, 'Analytics retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve analytics');
  }
};

export const updateCreditStatus = async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return errorResponse(res, 'date is required (YYYY-MM-DD)', 'Bad Request', 400);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return errorResponse(res, 'Invalid date format. Use YYYY-MM-DD', 'Bad Request', 400);
    }

    // Single bulk UPDATE — one SQL statement, efficient for millions of rows.
    // Uses indexes on orderStatus + creditDay.
    const [updatedCount] = await Order.update(
      { orderStatus: 'Credit' },
      {
        where: {
          orderStatus: 'Hold',
          creditDay:   { [Op.lte]: date }
        }
      }
    );

    return successResponse(
      res,
      { updatedCount, date },
      `${updatedCount} order(s) moved to Credit status (creditDay ≤ ${date})`
    );
  } catch (error) {
    return errorResponse(res, error, 'Failed to update credit status');
  }
};

export const creditApi = async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return errorResponse(res, 'date is required (YYYY-MM-DD)', 'Bad Request', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
      return errorResponse(res, 'Invalid date format. Use YYYY-MM-DD', 'Bad Request', 400);
    }

    // 1. Find all Hold orders whose creditDay matches the given date exactly
    const orders = await Order.findAll({
      where: { creditDay: date, orderStatus: 'Hold' },
      attributes: ['id', 'orderId', 'shopifyCustomerId'],
    });

    if (orders.length === 0) {
      return successResponse(res, { updatedCount: 0, tiersRecalculated: 0, date }, 'No matching orders found');
    }

    // 2. Bulk-update all matched orders to Credit
    const orderIds = orders.map(o => o.id);
    await Order.update(
      { orderStatus: 'Credit' },
      { where: { id: { [Op.in]: orderIds } } }
    );

    // 3. Recalculate tier for each unique customer
    const uniqueCustomerIds = [...new Set(orders.map(o => o.shopifyCustomerId).filter(Boolean))];

    const tierResults = await Promise.allSettled(
      uniqueCustomerIds.map(custId => recalculateCustomerTier(custId))
    );

    const failed = tierResults
      .map((r, i) => r.status === 'rejected' ? { custId: uniqueCustomerIds[i], reason: r.reason?.message } : null)
      .filter(Boolean);

    if (failed.length) {
      console.warn('[creditApi] Tier recalculation failed for some customers:', failed);
    }

    return successResponse(res, {
      updatedCount:       orders.length,
      tiersRecalculated:  uniqueCustomerIds.length - failed.length,
      tiersFailed:        failed.length,
      date,
    }, `${orders.length} order(s) credited and ${uniqueCustomerIds.length - failed.length} customer tier(s) recalculated`);

  } catch (error) {
    return errorResponse(res, error, 'Failed to run credit job');
  }
};

export const exportOrders = async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const where = buildOrderWhere(req.query);
    const dbOrder = [['createdAt', 'DESC']];

    if (format === 'pdf') {
      const rows = await Order.findAll({ where, order: dbOrder, raw: true });
      return sendPDF(res, 'orders.pdf', 'Orders Report', ORDER_PDF_COLUMNS, rows);
    }

    // CSV — batch-streamed to handle millions of rows without OOM
    await streamCSV(
      res,
      'orders.csv',
      ORDER_CSV_COLUMNS,
      (limit, offset) => Order.findAll({ where, order: dbOrder, limit, offset, raw: true })
    );
  } catch (error) {
    if (!res.headersSent) {
      return errorResponse(res, error, 'Failed to export orders');
    }
    console.error('Export error after headers sent:', error);
    res.end();
  }
};
