import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';
import { updateShopifyCustomerNote } from '../helpers/shopify.helper';
import {
  findCustomerByIdentifier,
  grantBonusToCustomer,
  customerSummary,
} from '../helpers/customerBonus.helper';

const Customer = db.Customer;

const MAX_BULK_ROWS = 1000;

/**
 * GET /api/customer-bonus/find?phone=...&email=...
 * Either param works on its own — resolved via the same phone/email
 * detection used by the bulk upload path.
 */
export const findCustomer = async (req, res) => {
  try {
    const { phone, email } = req.query;

    if (!phone && !email) {
      return errorResponse(res, 'Provide a phone number or email', 'Bad Request', 400);
    }

    const customer = await findCustomerByIdentifier(phone || email);
    if (!customer) {
      return errorResponse(res, 'No customer found for that phone/email', 'Not Found', 404);
    }

    return successResponse(res, { customer: customerSummary(customer) }, 'Customer found');
  } catch (error) {
    console.error('[CustomerBonus] findCustomer error:', error);
    return errorResponse(res, error, 'Failed to find customer', 500);
  }
};

/**
 * POST /api/customer-bonus/grant
 * Body: { shopifyCustomerId, points, note } — at least one of points/note required.
 */
export const grantBonus = async (req, res) => {
  try {
    const { shopifyCustomerId, points, note } = req.body;

    if (!shopifyCustomerId) {
      return errorResponse(res, 'shopifyCustomerId is required', 'Bad Request', 400);
    }

    const hasPoints = points !== undefined && points !== null && points !== '';
    const bonusPoints = hasPoints ? parseInt(points, 10) : 0;

    if (hasPoints && (!Number.isFinite(bonusPoints) || bonusPoints <= 0)) {
      return errorResponse(res, 'points must be a positive whole number', 'Bad Request', 400);
    }

    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    if (bonusPoints <= 0 && !trimmedNote) {
      return errorResponse(res, 'Provide bonus points and/or a note', 'Bad Request', 400);
    }

    const customer = await Customer.findOne({ where: { shopifyCustomerId } });
    if (!customer) {
      return errorResponse(res, 'Customer not found', 'Not Found', 404);
    }

    const { customer: updatedCustomer, log } = await grantBonusToCustomer({
      customerId:      customer.id,
      points:          bonusPoints,
      note:            trimmedNote,
      grantedByUserId: req.user.id,
    });

    // Best-effort — only meaningful when points actually changed the wallet
    if (bonusPoints > 0) {
      try {
        await updateShopifyCustomerNote(updatedCustomer.shopifyCustomerId, updatedCustomer.currentTier);
      } catch (noteErr) {
        console.error('[CustomerBonus] Shopify note update failed:', noteErr.message);
      }
    }

    const message = bonusPoints > 0
      ? `Granted ₹${bonusPoints} bonus to wallet${trimmedNote ? ' (note saved)' : ''}`
      : 'Note saved for customer';

    return successResponse(res, {
      log: {
        id:         log.id,
        points:     log.points,
        couponCode: log.couponCode,
        note:       log.note,
        createdAt:  log.createdAt,
      },
    }, message);

  } catch (error) {
    if (error.statusCode === 404) {
      return errorResponse(res, error.message, 'Not Found', 404);
    }
    console.error('[CustomerBonus] grantBonus error:', error);
    return errorResponse(res, error, 'Failed to grant bonus', 500);
  }
};

/**
 * POST /api/customer-bonus/bulk-grant
 * Body: { rows: [{ identifier, points }, ...] } — identifier is phone or email.
 *
 * Capped at MAX_BULK_ROWS (1000) per request — rejected upfront rather than
 * silently truncated, so nothing is ever dropped without the admin knowing.
 *
 * Each row is its own atomic transaction (via grantBonusToCustomer), so one
 * bad row (typo, unknown customer) can never roll back the others — every
 * row gets an independent success/failure verdict in the response.
 *
 * No Shopify note sync here (unlike the single-grant endpoint): doing that
 * for up to 1000 rows sequentially would be slow and risks Shopify API rate
 * limits, and the note is purely cosmetic/best-effort to begin with.
 */
export const bulkGrant = async (req, res) => {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return errorResponse(res, 'rows must be a non-empty array', 'Bad Request', 400);
    }
    if (rows.length > MAX_BULK_ROWS) {
      return errorResponse(
        res,
        `Maximum ${MAX_BULK_ROWS} rows per upload — this file has ${rows.length}. Split it into smaller files.`,
        'Bad Request',
        400
      );
    }

    const results = [];
    let succeeded = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum     = i + 1;
      const identifier = String(rows[i]?.identifier ?? '').trim();
      const points     = parseInt(rows[i]?.points, 10);

      if (!identifier) {
        results.push({ row: rowNum, identifier, status: 'failed', reason: 'Missing phone/email' });
        continue;
      }
      if (!Number.isFinite(points) || points <= 0) {
        results.push({ row: rowNum, identifier, status: 'failed', reason: 'Invalid bonus points (must be a positive whole number)' });
        continue;
      }

      try {
        const customer = await findCustomerByIdentifier(identifier);
        if (!customer) {
          results.push({ row: rowNum, identifier, points, status: 'failed', reason: 'Customer not found' });
          continue;
        }

        const { log } = await grantBonusToCustomer({
          customerId:      customer.id,
          points,
          note:            null,
          grantedByUserId: req.user.id,
        });

        succeeded++;
        results.push({
          row:               rowNum,
          identifier,
          points,
          status:            'success',
          customerName:      `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || null,
          shopifyCustomerId: customer.shopifyCustomerId,
          couponCode:        log.couponCode,
        });
      } catch (rowErr) {
        console.error(`[CustomerBonus] bulkGrant row ${rowNum} failed:`, rowErr.message);
        results.push({ row: rowNum, identifier, points, status: 'failed', reason: rowErr.message || 'Unexpected error' });
      }
    }

    return successResponse(res, {
      totalRows: rows.length,
      succeeded,
      failed:    rows.length - succeeded,
      results,
    }, `Bulk bonus processed — ${succeeded} succeeded, ${rows.length - succeeded} failed`);

  } catch (error) {
    console.error('[CustomerBonus] bulkGrant error:', error);
    return errorResponse(res, error, 'Failed to process bulk bonus upload', 500);
  }
};

/**
 * GET /api/customer-bonus/history/:shopifyCustomerId
 */
export const getBonusHistory = async (req, res) => {
  try {
    const { shopifyCustomerId } = req.params;

    const customer = await Customer.findOne({ where: { shopifyCustomerId } });
    if (!customer) {
      return errorResponse(res, 'Customer not found', 'Not Found', 404);
    }

    const logs = await db.CustomerBonusLog.findAll({
      where: { customerId: customer.id },
      order: [['createdAt', 'DESC']],
      include: [{ model: db.User, as: 'grantedBy', attributes: ['id', 'firstName', 'lastName'] }],
    });

    return successResponse(res, {
      history: logs.map(l => ({
        id:         l.id,
        points:     l.points,
        couponCode: l.couponCode,
        note:       l.note,
        grantedBy:  l.grantedBy ? `${l.grantedBy.firstName} ${l.grantedBy.lastName}`.trim() : null,
        createdAt:  l.createdAt,
      })),
    }, 'Bonus history retrieved');
  } catch (error) {
    console.error('[CustomerBonus] getBonusHistory error:', error);
    return errorResponse(res, error, 'Failed to get bonus history', 500);
  }
};
