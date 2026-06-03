import express from 'express';
import * as CustomerController from '../controllers/CustomerController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Public — customer self-registration from storefront
router.post('/register', CustomerController.registerCustomer);

// Protected — admin only
router.get('/',                          authenticate, CustomerController.getAllCustomers);
router.get('/stats',                     authenticate, CustomerController.getCustomerStats);
router.get('/export',                    authenticate, CustomerController.exportCustomers);
router.post('/coupon-status',            authenticate, CustomerController.getCouponStatus);
router.get('/:shopifyCustomerId/orders', authenticate, CustomerController.getCustomerOrders);
router.get('/:id',                       authenticate, CustomerController.getCustomerById);

export default router;
