import express from 'express';
import * as AuthController from '../controllers/AuthController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

router.post('/login',           AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/verify-otp',      AuthController.verifyOtp);
router.post('/reset-password',  AuthController.resetPassword);
router.get('/me',               authenticate, AuthController.me);

export default router;
