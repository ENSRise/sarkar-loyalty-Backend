import bcrypt from 'bcryptjs';
import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';

const User = db.User;
const Role = db.Role;

const safeUser = (u) => {
  const obj = u.toJSON ? u.toJSON() : { ...u };
  delete obj.passwordHash;
  delete obj.resetOtp;
  delete obj.resetOtpExpiry;
  return obj;
};

export const listUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'role', 'roleId', 'isActive', 'createdAt'],
      include: [{ model: Role, as: 'userRole', attributes: ['id', 'name', 'permissions'] }],
      order: [['createdAt', 'DESC']],
    });
    return successResponse(res, users, 'Users retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve users');
  }
};

export const createUser = async (req, res) => {
  try {
    const { firstName, lastName, phone, password, role, roleId } = req.body;

    if (!firstName?.trim() || !phone?.trim() || !password) {
      return errorResponse(res, 'firstName, phone, and password are required', 'Bad Request', 400);
    }

    if (!role || !['super_admin', 'admin'].includes(role)) {
      return errorResponse(res, 'role must be super_admin or admin', 'Bad Request', 400);
    }

    // Non-super-admin users must have a roleId
    if (role === 'admin' && !roleId) {
      return errorResponse(res, 'roleId is required for admin users', 'Bad Request', 400);
    }

    if (password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters', 'Bad Request', 400);
    }

    const existing = await User.findOne({ where: { phone: phone.trim() } });
    if (existing) {
      return errorResponse(res, 'This phone number is already registered', 'Conflict', 409);
    }

    if (roleId) {
      const roleRecord = await Role.findByPk(roleId);
      if (!roleRecord) {
        return errorResponse(res, 'Selected role not found', 'Bad Request', 400);
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      firstName:    firstName.trim(),
      lastName:     (lastName || '').trim(),
      phone:        phone.trim(),
      email:        req.body.email || null,
      passwordHash,
      role,
      roleId:       role === 'super_admin' ? null : (roleId || null),
      isActive:     true,
    });

    const withRole = await User.findByPk(user.id, {
      include: [{ model: Role, as: 'userRole', attributes: ['id', 'name'] }],
    });

    return successResponse(res, safeUser(withRole), 'User created successfully', 201);
  } catch (error) {
    return errorResponse(res, error, 'Failed to create user');
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, role, roleId, isActive, password } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return errorResponse(res, 'User not found', 'Not Found', 404);
    }

    // Self-protection
    if (parseInt(id) === req.user.id) {
      if (role && role !== req.user.role) {
        return errorResponse(res, 'You cannot change your own role', 'Forbidden', 403);
      }
      if (isActive === false) {
        return errorResponse(res, 'You cannot deactivate your own account', 'Forbidden', 403);
      }
    }

    if (role && !['super_admin', 'admin'].includes(role)) {
      return errorResponse(res, 'Invalid role', 'Bad Request', 400);
    }

    if (roleId) {
      const roleRecord = await Role.findByPk(roleId);
      if (!roleRecord) {
        return errorResponse(res, 'Selected role not found', 'Bad Request', 400);
      }
    }

    const updates = {};
    if (firstName !== undefined)  updates.firstName = firstName.trim();
    if (lastName !== undefined)   updates.lastName  = (lastName || '').trim();
    if (role !== undefined)       updates.role      = role;
    if (roleId !== undefined)     updates.roleId    = (role === 'super_admin' || roleId === null) ? null : roleId;
    if (isActive !== undefined)   updates.isActive  = isActive;
    if (password) {
      if (password.length < 6) {
        return errorResponse(res, 'Password must be at least 6 characters', 'Bad Request', 400);
      }
      updates.passwordHash = await bcrypt.hash(password, 12);
    }

    await user.update(updates);

    const withRole = await User.findByPk(id, {
      include: [{ model: Role, as: 'userRole', attributes: ['id', 'name'] }],
    });

    return successResponse(res, safeUser(withRole), 'User updated successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to update user');
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return errorResponse(res, 'You cannot delete your own account', 'Forbidden', 403);
    }

    const user = await User.findByPk(id);
    if (!user) {
      return errorResponse(res, 'User not found', 'Not Found', 404);
    }

    await user.destroy();
    return successResponse(res, {}, 'User deleted successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to delete user');
  }
};
