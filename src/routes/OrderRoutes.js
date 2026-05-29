import express from 'express';
import * as OrderController from '../controllers/OrderController';

const router = express.Router();

router.get('/',                       OrderController.getAllOrders);
router.get('/analytics',              OrderController.getOrderAnalytics);       // before /:orderId
router.get('/export',                 OrderController.exportOrders);            // before /:orderId
router.patch('/update-credit-status', OrderController.updateCreditStatus);     // before /:orderId
router.get('/:orderId',               OrderController.getOrderById);
router.patch('/:orderId/status',      OrderController.updateOrderStatus);
router.patch('/:orderId/return-window', OrderController.updateReturnWindow);

export default router;
