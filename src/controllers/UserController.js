import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';

const User = db.User;

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    return successResponse(res, users, 'Users retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve users');
  }
};

export const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const user = await User.create({ firstName, lastName, email });
    return successResponse(res, user, 'User created successfully', 201);
  } catch (error) {
    return errorResponse(res, error, 'Failed to create user');
  }
};
