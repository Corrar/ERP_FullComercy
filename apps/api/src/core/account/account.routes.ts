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
import { requireHuman } from '../../shared/turnstile';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });
const accountId = (req: Request) => (req as AccountRequest).accountId!;

router.post('/register', authLimiter, requireHuman, asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: z.string().email(), password: z.string().min(8).max(200) }), req.body);
  res.status(201).json(await account.register(b));
}));
router.post('/login', authLimiter, requireHuman, asyncHandler(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  res.json(await account.login(b));
}));
router.post('/google', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ credential: z.string().min(10).max(8192) }), req.body);
  res.json(await account.loginWithGoogle(b.credential));
}));

// Esqueci a senha da conta: resposta sempre igual (não revela se o e-mail tem conta).
const forgotLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
router.post('/forgot', forgotLimiter, requireHuman, asyncHandler(async (req, res) => {
  await account.forgotAccountPassword(parse(z.object({ email: z.string().email() }), req.body).email);
  res.json({ ok: true });
}));
router.post('/reset', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(200) }), req.body);
  res.json(await account.resetAccountPassword(b.token, b.password));
}));

router.get('/me', authenticateAccount, asyncHandler(async (req, res) => { res.json(await account.me(accountId(req))); }));
router.post('/companies/:tenantId/session', authenticateAccount, asyncHandler(async (req, res) => {
  const tenantId = parse(z.string().uuid(), req.params.tenantId);
  res.json(await account.enterCompany(accountId(req), tenantId, meta(req)));
}));

// Reenviar dados de acesso: por conta, poucos por janela (não vira disparador de e-mail).
const reenvioLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `acct:${accountId(req)}` });
router.post('/companies/:tenantId/reenviar-acesso', authenticateAccount, reenvioLimiter, asyncHandler(async (req, res) => {
  res.json(await account.reenviarDadosDeAcesso(accountId(req), parse(z.string().uuid(), req.params.tenantId)));
}));
router.get('/companies/:tenantId/assinatura', authenticateAccount, asyncHandler(async (req, res) => {
  res.json(await account.assinaturaDaEmpresa(accountId(req), parse(z.string().uuid(), req.params.tenantId)));
}));

const checkoutSchema = z.object({
  company: z.object({ name: z.string().trim().min(2).max(160), document: z.string().min(11).max(20) }),
  modules: z.array(z.nativeEnum(ModuleKey)).default([]),
  features: z.array(z.string().max(60)).max(60),
  payment: z.object({ method: z.nativeEnum(BillingMethod), cardToken: z.string().max(200).optional() }),
});
// Preparo do cartão (SetupIntent do Stripe) antes do checkout: o navegador confirma o cartão com
// o 3-D Secure do banco e devolve o `pm_…` que o checkout prende ao Customer.
router.post('/billing/card-setup', authLimiter, authenticateAccount, asyncHandler(async (_req, res) => {
  res.json(await billing.cardSetupForCheckout());
}));
router.post('/checkout', authLimiter, authenticateAccount, requireHuman, asyncHandler(async (req, res) => {
  res.status(201).json(await billing.checkout(accountId(req), parse(checkoutSchema, req.body), meta(req)));
}));

export default router;
