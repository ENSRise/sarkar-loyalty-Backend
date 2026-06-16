import express from 'express';
import { getCustomerOrders } from '../controllers/CustomerController';

const router = express.Router();

// Public — no auth, called directly from Shopify storefront
// GET /api/customershopify/:shopifyCustomerId/orders
router.get('/:shopifyCustomerId/orders', getCustomerOrders);

export default router;
