import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as InterestedCustomerController from '../controllers/InterestedCustomerController';

const router = express.Router();

// Public — silently called from the register form
router.post('/capture', InterestedCustomerController.captureInterest);

// Protected — admin listing + export
router.get('/export', authenticate, InterestedCustomerController.exportInterestedCustomers);
router.get('/',       authenticate, InterestedCustomerController.getInterestedCustomers);

export default router;
