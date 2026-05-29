import express from 'express';
import * as AdminController from '../controllers/AdminController';
import roleRoutes from './RoleRoutes';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All admin routes require super_admin
router.use(authenticate, authorize('super_admin'));

// User management
router.get('/users',        AdminController.listUsers);
router.post('/users',       AdminController.createUser);
router.patch('/users/:id',  AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);

// Role management
router.use('/roles', roleRoutes);

export default router;
