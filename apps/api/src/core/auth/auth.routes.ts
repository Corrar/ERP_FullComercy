import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/http';
import { authenticate } from './auth.middleware';
import { requireHuman } from '../../shared/turnstile';
import { getMe, postForgot, postLogin, postLogout, postRefresh, postReset } from './auth.controller';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, requireHuman, asyncHandler(postLogin));
router.post('/refresh', loginLimiter, asyncHandler(postRefresh));
router.post('/logout', asyncHandler(postLogout));
router.post('/forgot', rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false }), requireHuman, asyncHandler(postForgot));
router.post('/reset', loginLimiter, asyncHandler(postReset));
router.get('/me', authenticate, asyncHandler(getMe));

export default router;
