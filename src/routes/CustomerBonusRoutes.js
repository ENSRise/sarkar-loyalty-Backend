import express from 'express';
import * as CustomerBonusController from '../controllers/CustomerBonusController';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// All customer-bonus routes require super_admin — granting points creates
// real spendable Shopify coupon value, so access is restricted by default.
router.use(authenticate, authorize('super_admin'));

router.get('/find',                       CustomerBonusController.findCustomer);
router.post('/grant',                     CustomerBonusController.grantBonus);
router.get('/history/:shopifyCustomerId', CustomerBonusController.getBonusHistory);

export default router;
