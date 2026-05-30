import express from 'express';
import { submitReferral, checkReferralOrders, getReferralStats } from '../controllers/ReferralController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Public — called by storefront or cron system
router.post('/submit',        submitReferral);
router.post('/check-orders',  checkReferralOrders);  // run after daily credit job

// Protected — admin dashboard
router.get('/stats',          authenticate, getReferralStats);

export default router;
