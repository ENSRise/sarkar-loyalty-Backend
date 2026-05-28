import express from 'express';
import * as WebhookController from '../controllers/WebhookController';

const router = express.Router();

router.post('/customer/create', WebhookController.createCustomer);
router.post('/customer/update', WebhookController.updateCustomer);
router.post('/order/create', WebhookController.createOrder);
router.post('/order/update', WebhookController.updateOrder);
router.post('/order/cancel', WebhookController.cancelOrder);

export default router;
