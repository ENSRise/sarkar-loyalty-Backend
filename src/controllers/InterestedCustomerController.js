import { Op } from 'sequelize';
import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { sendXLSX, sendPDF } from '../helpers/export.helper';

const InterestedCustomer = db.InterestedCustomer;
const Customer           = db.Customer;

/* ── Shared: build exclusion set of phones that have already joined ── */
const getJoinedPhones = async () => {
  const joined = await Customer.findAll({ attributes: ['phone'], where: { phone: { [Op.ne]: null } } });
  return joined.map(c => String(c.phone).slice(-10));
};

/* ── Shared: build WHERE clause from query params ─────────────────── */
const buildWhere = async ({ search, startDate, endDate }) => {
  const joinedPhones = await getJoinedPhones();

  const where = {
    phone: { [Op.notIn]: joinedPhones.length ? joinedPhones : ['__none__'] },
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt[Op.gte] = new Date(startDate + 'T00:00:00.000Z');
    if (endDate)   where.createdAt[Op.lte] = new Date(endDate   + 'T23:59:59.999Z');
  }

  if (search) {
    where[Op.or] = [
      { firstName: { [Op.iLike]: `%${search}%` } },
      { lastName:  { [Op.iLike]: `%${search}%` } },
      { email:     { [Op.iLike]: `%${search}%` } },
      { phone:     { [Op.iLike]: `%${search}%` } },
    ];
  }

  return where;
};

/* ── Export columns ───────────────────────────────────────────────── */
const fmtDateCol  = (v) => v ? String(v).split('T')[0] : '';
const fmtDTCol    = (v) => v ? new Date(v).toLocaleString('en-IN') : '';

const XLSX_COLUMNS = [
  { label: 'First Name',   key: 'firstName',       width: 16 },
  { label: 'Last Name',    key: 'lastName',        width: 16 },
  { label: 'Email',        key: 'email',           width: 28 },
  { label: 'Phone',        key: 'phone',           width: 18 },
  { label: 'Birthday',     key: 'birthdayDate',    width: 14, formatter: fmtDateCol },
  { label: 'Anniversary',  key: 'anniversaryDate', width: 16, formatter: fmtDateCol },
  { label: 'Captured At',  key: 'createdAt',       width: 24, formatter: fmtDTCol  },
];

const PDF_COLUMNS = [
  { label: 'First Name',  key: 'firstName',       weight: 1.2 },
  { label: 'Last Name',   key: 'lastName',        weight: 1.2 },
  { label: 'Email',       key: 'email',           weight: 2   },
  { label: 'Phone',       key: 'phone',           weight: 1.2 },
  { label: 'Birthday',    key: 'birthdayDate',    weight: 1,   formatter: fmtDateCol },
  { label: 'Anniversary', key: 'anniversaryDate', weight: 1,   formatter: fmtDateCol },
  { label: 'Captured At', key: 'createdAt',       weight: 1.8, formatter: fmtDTCol  },
];

// ─── POST /api/interested-customers/capture  (public) ─────────────────────────
export const captureInterest = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, birthdayDate, anniversaryDate } = req.body;

    if (!phone) return errorResponse(res, null, 'phone is required', 400);

    const digits = String(phone).replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return errorResponse(res, null, 'Invalid phone number', 400);

    const existing = await InterestedCustomer.findOne({ where: { phone: digits } });

    if (existing) {
      await existing.update({
        firstName:       firstName       || existing.firstName,
        lastName:        lastName        || existing.lastName,
        email:           email           || existing.email,
        birthdayDate:    birthdayDate    || existing.birthdayDate,
        anniversaryDate: anniversaryDate || existing.anniversaryDate,
      });
      return successResponse(res, { id: existing.id }, 'Interest updated');
    }

    const record = await InterestedCustomer.create({
      firstName:       firstName       || null,
      lastName:        lastName        || null,
      email:           email           || null,
      phone:           digits,
      birthdayDate:    birthdayDate    || null,
      anniversaryDate: anniversaryDate || null,
      shopName:        process.env.shopName || null,
    });

    return successResponse(res, { id: record.id }, 'Interest captured');
  } catch (err) {
    console.error('[InterestedCustomer] captureInterest error:', err);
    return errorResponse(res, err, 'Failed to capture interest', 500);
  }
};

// ─── GET /api/interested-customers  (protected) ───────────────────────────────
export const getInterestedCustomers = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || 1,  10));
    const limit  = Math.min(100, parseInt(req.query.limit || 20, 10));
    const offset = (page - 1) * limit;

    const where = await buildWhere(req.query);

    const { count, rows } = await InterestedCustomer.findAndCountAll({
      where,
      order:  [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return successResponse(res, {
      customers:  rows,
      total:      count,
      page,
      pages:      Math.ceil(count / limit),
    }, 'Interested customers fetched');
  } catch (err) {
    console.error('[InterestedCustomer] getInterestedCustomers error:', err);
    return errorResponse(res, err, 'Failed to fetch interested customers', 500);
  }
};

// ─── GET /api/interested-customers/export  (protected) ────────────────────────
export const exportInterestedCustomers = async (req, res) => {
  try {
    const { format = 'xlsx' } = req.query;
    const where = await buildWhere(req.query);
    const rows  = await InterestedCustomer.findAll({ where, order: [['createdAt', 'DESC']], raw: true });

    if (format === 'pdf') {
      return sendPDF(res, 'interested-customers.pdf', 'Interested Customers', PDF_COLUMNS, rows);
    }

    return sendXLSX(res, 'interested-customers.xlsx', 'Interested Customers', XLSX_COLUMNS, rows);
  } catch (err) {
    if (!res.headersSent) return errorResponse(res, err, 'Failed to export', 500);
    console.error('[InterestedCustomer] export error after headers sent:', err);
    res.end();
  }
};

// ─── Internal: remove from this list when customer joins ──────────────────────
export const removeInterest = async (phone) => {
  try {
    const digits = String(phone).replace(/\D/g, '').slice(-10);
    if (digits.length === 10) await InterestedCustomer.destroy({ where: { phone: digits } });
  } catch (err) {
    console.error('[InterestedCustomer] removeInterest error (non-critical):', err.message);
  }
};
