import express from 'express';
import { settleAmount, getSettlementStatus } from '../controllers/SettlementController';

const router = express.Router();

router.post('/settle', settleAmount);
router.get('/status',  getSettlementStatus);

export default router;
