import express from 'express';
import * as TierInfoController from '../controllers/TierInfoController';

const router = express.Router();

router.post('/', TierInfoController.upsertTierInfo);
router.get('/', TierInfoController.getAllTierInfo);
router.get('/:shopName', TierInfoController.getTierInfo);

export default router;
