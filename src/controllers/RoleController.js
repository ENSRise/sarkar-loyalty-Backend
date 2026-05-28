import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';

const Role = db.Role;

export const listRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      order: [['isBuiltIn', 'DESC'], ['createdAt', 'ASC']],
      include: [{
        model: db.User,
        as: 'users',
        attributes: ['id'],
      }],
    });

    const result = roles.map(r => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      permissions: r.permissions,
      isBuiltIn:   r.isBuiltIn,
      userCount:   r.users?.length || 0,
    }));

    return successResponse(res, result, 'Roles retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve roles');
  }
};

export const createRole = async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    if (!name?.trim()) {
      return errorResponse(res, 'Role name is required', 'Bad Request', 400);
    }

    if (!permissions || typeof permissions !== 'object') {
      return errorResponse(res, 'Permissions object is required', 'Bad Request', 400);
    }

    const existing = await Role.findOne({ where: { name: name.trim() } });
    if (existing) {
      return errorResponse(res, 'A role with this name already exists', 'Conflict', 409);
    }

    const role = await Role.create({
      name: name.trim(),
      description: description?.trim() || null,
      permissions,
      isBuiltIn: false,
    });

    return successResponse(res, role, 'Role created successfully', 201);
  } catch (error) {
    return errorResponse(res, error, 'Failed to create role');
  }
};

export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    const role = await Role.findByPk(id);
    if (!role) {
      return errorResponse(res, 'Role not found', 'Not Found', 404);
    }

    const updates = {};
    if (!role.isBuiltIn && name?.trim()) updates.name        = name.trim();
    if (description !== undefined)        updates.description = description?.trim() || null;
    if (permissions && typeof permissions === 'object') updates.permissions = permissions;

    await role.update(updates);
    return successResponse(res, role, 'Role updated successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to update role');
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const role = await Role.findByPk(id, {
      include: [{ model: db.User, as: 'users', attributes: ['id'] }],
    });

    if (!role) {
      return errorResponse(res, 'Role not found', 'Not Found', 404);
    }

    if (role.isBuiltIn) {
      return errorResponse(res, 'Built-in roles cannot be deleted', 'Forbidden', 403);
    }

    if (role.users?.length > 0) {
      return errorResponse(
        res,
        `Cannot delete — ${role.users.length} user(s) are assigned this role. Reassign them first.`,
        'Conflict', 409
      );
    }

    await role.destroy();
    return successResponse(res, {}, 'Role deleted successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to delete role');
  }
};
