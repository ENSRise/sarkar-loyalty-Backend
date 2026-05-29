import express from 'express';
import { submitReferral, getReferralStats } from '../controllers/ReferralController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/submit',   submitReferral);
router.get('/stats',     authenticate, getReferralStats);

export default router;
