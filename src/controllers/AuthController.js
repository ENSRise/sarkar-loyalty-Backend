import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';

const JWT_SECRET = process.env.JWT_SECRET || 'loyalty-sarkar-jwt-secret-2026';
const JWT_EXPIRY = '7d';

const User = db.User;

const ALL_PERMISSIONS = {
  dashboard:     { read: true },
  transactions:  { read: true, export: true },
  analytics:     { read: true },
  customers:     { read: true, export: true },
  tier_settings: { read: true, update: true },
};

const getUserPermissions = (u) => {
  if (u.role === 'super_admin') return ALL_PERMISSIONS;
  return u.userRole?.permissions || {};
};

const safeUser = (u) => ({
  id:          u.id,
  name:        [u.firstName, u.lastName].filter(Boolean).join(' '),
  firstName:   u.firstName,
  lastName:    u.lastName,
  phone:       u.phone,
  role:        u.role,
  roleId:      u.roleId,
  roleName:    u.role === 'super_admin' ? 'Super Admin' : (u.userRole?.name || 'Admin'),
  permissions: getUserPermissions(u),
});

export const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return errorResponse(res, 'Phone number and password are required', 'Bad Request', 400);
    }

    const user = await User.findOne({
      where: { phone: phone.trim() },
      include: [{ model: db.Role, as: 'userRole' }],
    });

    if (!user || !user.passwordHash) {
      return errorResponse(res, 'Invalid phone number or password', 'Unauthorized', 401);
    }

    if (!user.isActive) {
      return errorResponse(res, 'Your account has been deactivated. Contact the super admin.', 'Unauthorized', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return errorResponse(res, 'Invalid phone number or password', 'Unauthorized', 401);
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    return successResponse(res, { token, user: safeUser(user) }, 'Login successful');
  } catch (error) {
    return errorResponse(res, error, 'Login failed');
  }
};

export const me = async (req, res) => {
  return successResponse(res, safeUser(req.user), 'User retrieved');
};

export const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return errorResponse(res, 'Phone number is required', 'Bad Request', 400);
    }

    const user = await User.findOne({ where: { phone: phone.trim() } });

    if (!user) {
      return successResponse(res, { devOtp: null }, 'If this number is registered, an OTP has been sent');
    }

    const otp    = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await user.update({ resetOtp: otp, resetOtpExpiry: expiry });

    return successResponse(res, { devOtp: otp }, 'OTP sent to registered phone number');
  } catch (error) {
    return errorResponse(res, error, 'Failed to send OTP');
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return errorResponse(res, 'Phone and OTP are required', 'Bad Request', 400);
    }

    const user = await User.findOne({ where: { phone: phone.trim() } });

    if (!user || !user.resetOtp) {
      return errorResponse(res, 'Invalid OTP', 'Bad Request', 400);
    }

    if (user.resetOtp !== otp.trim()) {
      return errorResponse(res, 'Invalid OTP', 'Bad Request', 400);
    }

    if (new Date() > new Date(user.resetOtpExpiry)) {
      return errorResponse(res, 'OTP has expired. Please request a new one.', 'Bad Request', 400);
    }

    return successResponse(res, { verified: true }, 'OTP verified');
  } catch (error) {
    return errorResponse(res, error, 'OTP verification failed');
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { phone, otp, newPassword } = req.body;

    if (!phone || !otp || !newPassword) {
      return errorResponse(res, 'Phone, OTP and new password are required', 'Bad Request', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', 'Bad Request', 400);
    }

    const user = await User.findOne({ where: { phone: phone.trim() } });

    if (!user || !user.resetOtp || user.resetOtp !== otp.trim()) {
      return errorResponse(res, 'Invalid OTP', 'Bad Request', 400);
    }

    if (new Date() > new Date(user.resetOtpExpiry)) {
      return errorResponse(res, 'OTP has expired. Please request a new one.', 'Bad Request', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await user.update({ passwordHash, resetOtp: null, resetOtpExpiry: null });

    return successResponse(res, {}, 'Password reset successfully. You can now log in.');
  } catch (error) {
    return errorResponse(res, error, 'Password reset failed');
  }
};
