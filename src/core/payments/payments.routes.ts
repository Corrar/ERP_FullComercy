import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PaymentIntentStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, parse } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as pay from './payments.service';

const router = Router();
router.get('/providers', requirePermission('core.payments:manage'), (_req, res) => { res.json(pay.listProviders()); });
router.get('/intents', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => { res.json(await pay.listIntents(parse(z.object({ orderId: z.string().uuid().optional(), status: z.nativeEnum(PaymentIntentStatus).optional() }), req.query))); }));
router.post('/intents', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => {
  res.status(201).json(await pay.createIntent(parse(z.object({ provider: z.string().min(2).max(30), method: z.nativeEnum(PaymentMethod), orderId: z.string().uuid().optional(), financeEntryId: z.string().uuid().optional(), amount: z.number().positive().optional() }), req.body)));
}));
router.post('/intents/:id/confirm', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => { res.json(await pay.confirmManual(String(req.params.id))); }));
router.post('/intents/:id/cancel', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => { res.json(await pay.cancelIntent(String(req.params.id))); }));
export default router;

/** Público: o gateway chama aqui. A autenticidade é do provedor (assinatura/token). */
export const publicRouter = Router();
publicRouter.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
publicRouter.post('/:provider/webhook', asyncHandler(async (req, res) => {
  const r = await pay.handleWebhook(String(req.params.provider), req.headers as Record<string, string | string[] | undefined>, req.body);
  res.json({ ok: true, status: r.status });
}));
