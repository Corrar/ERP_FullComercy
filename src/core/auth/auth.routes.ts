import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/http';
import { authenticate } from './auth.middleware';
import { getMe, postLogin, postLogout, postRefresh } from './auth.controller';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, asyncHandler(postLogin));
router.post('/refresh', loginLimiter, asyncHandler(postRefresh));
router.post('/logout', asyncHandler(postLogout));
router.get('/me', authenticate, asyncHandler(getMe));

export default router;
