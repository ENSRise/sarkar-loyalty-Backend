import jwt from 'jsonwebtoken';
import db from '../models';
import { errorResponse } from '../helpers/response.helper';

const JWT_SECRET = process.env.JWT_SECRET || 'loyalty-sarkar-jwt-secret-2026';

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return errorResponse(res, 'Authentication required', 'Unauthorized', 401);
    }

    const token = header.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return errorResponse(res, 'Invalid or expired token', 'Unauthorized', 401);
    }

    const user = await db.User.findByPk(decoded.id, {
      include: [{ model: db.Role, as: 'userRole' }],
    });

    if (!user || !user.isActive) {
      return errorResponse(res, 'Account not found or deactivated', 'Unauthorized', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, error, 'Authentication failed', 500);
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return errorResponse(res, 'You do not have permission to perform this action', 'Forbidden', 403);
  }
  next();
};
