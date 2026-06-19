import express from 'express';
import { authenticate } from '../middleware/auth.middleware';

import authRoutes     from './AuthRoutes';
import adminRoutes    from './AdminRoutes';
import userRoutes     from './UserRoutes';
import webhookRoutes  from './WebhookRoutes';
import tierInfoRoutes from './TierInfoRoutes';
import customerRoutes from './CustomerRoutes';
import orderRoutes    from './OrderRoutes';
import scriptRoutes   from './ScriptRoutes';
import referralRoutes         from './ReferralRoutes';
import settingsRoutes         from './SettingsRoutes';
import settlementRoutes       from './SettlementRoutes';
import customerBonusRoutes    from './CustomerBonusRoutes';
import customerShopifyRoutes      from './CustomerShopifyRoutes';
import interestedCustomerRoutes   from './InterestedCustomerRoutes';
import { creditApi }     from '../controllers/OrderController';

const router = express.Router();

// ── Public routes (no auth) ────────────────────────────────────────
router.use('/auth',             authRoutes);
router.use('/webhooks',         webhookRoutes);         // Shopify webhooks — auth via HMAC
router.post('/credit',          creditApi);             // public — no auth required
router.post('/orders/credit',   creditApi);             // public — same endpoint, no auth
router.use('/referral',         referralRoutes);        // public — referral submission
router.use('/customershopify',      customerShopifyRoutes);    // public — called from Shopify storefront, no token
router.use('/interested-customers', interestedCustomerRoutes); // public capture + protected listing

// ── Protected routes (JWT required) ───────────────────────────────
router.use('/settings',   authenticate, settingsRoutes);
router.use('/admin',      adminRoutes);                     // super_admin only (middleware inside)
router.use('/customer-bonus', customerBonusRoutes);          // super_admin only (middleware inside)
router.use('/users',      authenticate, userRoutes);
router.use('/tier-info',  authenticate, tierInfoRoutes);
router.use('/customers',  customerRoutes);               // auth handled per-route inside (register is public)
router.use('/orders',     authenticate, orderRoutes);
router.use('/settlement', authenticate, settlementRoutes);
router.use('/',           scriptRoutes);                    // public script served to storefront (last — catch-all)

export default router;
