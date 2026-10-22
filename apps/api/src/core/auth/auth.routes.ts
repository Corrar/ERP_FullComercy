import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { asyncHandler } from '../../shared/http';
import { authenticate } from './auth.middleware';
import { requireHuman } from '../../shared/turnstile';
import { getMe, postForgot, postLogin, postLogout, postRefresh, postReset } from './auth.controller';

const router = Router();
// Limites SEPARADOS. Antes um único contador (20 por IP em 15 min) servia login, refresh e reset:
// uma loja com a equipe atrás do mesmo IP esgotava só com as renovações de token (a cada 15 min)
// e todo mundo caía. Login: por conta (IP + empresa + e-mail) contra força bruta, mais um teto por
// IP contra varredura de contas. Refresh: o token é segredo aleatório, só um teto largo por IP.
const janela = 15 * 60_000;
const base = { windowMs: janela, standardHeaders: true, legacyHeaders: false } as const;
const ip = (req: { ip?: string }) => ipKeyGenerator(req.ip ?? '');
const loginPorConta = rateLimit({ ...base, limit: 10, keyGenerator: (req) => `${ip(req)}|${String(req.body?.tenant ?? '').toLowerCase()}|${String(req.body?.email ?? '').toLowerCase()}` });
const loginPorIp = rateLimit({ ...base, limit: 100 });
const refreshLimiter = rateLimit({ ...base, limit: 600 });
const resetLimiter = rateLimit({ ...base, limit: 20 });

router.post('/login', loginPorIp, loginPorConta, requireHuman, asyncHandler(postLogin));
router.post('/refresh', refreshLimiter, asyncHandler(postRefresh));
router.post('/logout', asyncHandler(postLogout));
router.post('/forgot', rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false }), requireHuman, asyncHandler(postForgot));
router.post('/reset', resetLimiter, asyncHandler(postReset));
router.get('/me', authenticate, asyncHandler(getMe));

export default router;
