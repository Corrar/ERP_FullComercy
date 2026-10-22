// src/core/billing/billing.routes.ts — a vitrine pública da loja (catálogo, orçamento, webhook do
// gateway) e as rotas da EMPRESA sobre o próprio plano.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { BillingMethod, ModuleKey } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, parse } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as billing from './billing.service';

const selection = z.object({ modules: z.array(z.nativeEnum(ModuleKey)).default([]), features: z.array(z.string().max(60)).max(60).default([]) });

/** /public/billing — sem login: é a loja. */
export const publicBillingRouter = Router();
publicBillingRouter.get('/catalog', (_req, res) => { res.json(billing.publicCatalog()); });
publicBillingRouter.post('/quote', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }), asyncHandler(async (req, res) => {
  res.json(billing.quote(parse(selection, req.body)));
}));
publicBillingRouter.post('/webhooks/:provider', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }), asyncHandler(async (req, res) => {
  res.json(await billing.handleWebhook(String(req.params.provider), req.headers, req.body, (req as { rawBody?: Buffer }).rawBody));
}));

/** /billing — a empresa logada sobre a própria assinatura. Montado com `tenantContextAllowSuspended`. */
const router = Router();
const P = requirePermission('core.billing:manage');
router.get('/subscription', P, asyncHandler(async (_req, res) => { res.json(await billing.getSubscription()); }));
router.put('/subscription/features', P, asyncHandler(async (req, res) => { res.json(await billing.changeFeatures(parse(selection, req.body))); }));
router.post('/subscription/features/preview', P, asyncHandler(async (req, res) => { res.json(await billing.previewFeatures(parse(selection, req.body))); }));
router.post('/card-setup', P, asyncHandler(async (_req, res) => { res.json(await billing.cardSetupForTenant()); }));
router.put('/payment-method', P, asyncHandler(async (req, res) => {
  res.json(await billing.changePaymentMethod(parse(z.object({ method: z.nativeEnum(BillingMethod), cardToken: z.string().max(200).optional() }), req.body)));
}));
router.post('/invoices/:id/pay', P, asyncHandler(async (req, res) => { res.json(await billing.payInvoice(parse(z.string().uuid(), req.params.id))); }));
router.post('/subscription/cancel', P, asyncHandler(async (_req, res) => { res.json(await billing.cancel()); }));
router.post('/subscription/reactivate', P, asyncHandler(async (_req, res) => { res.json(await billing.reactivate()); }));

export default router;
