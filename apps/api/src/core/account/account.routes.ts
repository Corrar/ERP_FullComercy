// src/core/account/account.routes.ts — /account: a conta do comprador (cadastro, login com senha
// ou Google, minhas empresas, abrir uma empresa) e o CHECKOUT da loja de módulos.
import { Router, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { BillingMethod, ModuleKey } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, parse } from '../../shared/http';
import { authenticateAccount, type AccountRequest } from './account.middleware';
import * as account from './account.service';
import * as billing from '../billing/billing.service';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });
const accountId = (req: Request) => (req as AccountRequest).accountId!;

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), password: z.string().min(8).max(200) }), req.body);
  res.status(201).json(await account.register(b));
}));
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  res.json(await account.login(b));
}));
router.post('/google', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ credential: z.string().min(10).max(8192) }), req.body);
  res.json(await account.loginWithGoogle(b.credential));
}));

router.get('/me', authenticateAccount, asyncHandler(async (req, res) => { res.json(await account.me(accountId(req))); }));
router.post('/companies/:tenantId/session', authenticateAccount, asyncHandler(async (req, res) => {
  const tenantId = parse(z.string().uuid(), req.params.tenantId);
  res.json(await account.enterCompany(accountId(req), tenantId, meta(req)));
}));

const checkoutSchema = z.object({
  company: z.object({ name: z.string().trim().min(2).max(160), document: z.string().min(11).max(20) }),
  modules: z.array(z.nativeEnum(ModuleKey)).default([]),
  features: z.array(z.string().max(60)).max(60),
  payment: z.object({ method: z.nativeEnum(BillingMethod), cardToken: z.string().max(200).optional() }),
});
router.post('/checkout', authLimiter, authenticateAccount, asyncHandler(async (req, res) => {
  res.status(201).json(await billing.checkout(accountId(req), parse(checkoutSchema, req.body), meta(req)));
}));

export default router;
