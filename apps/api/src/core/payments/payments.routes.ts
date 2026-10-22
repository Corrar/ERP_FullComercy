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
  res.status(201).json(await pay.createIntent(parse(z.object({ provider: z.string().min(2).max(30).optional(), method: z.nativeEnum(PaymentMethod), orderId: z.string().uuid().optional(), financeEntryId: z.string().uuid().optional(), amount: z.number().positive().optional() }), req.body)));
}));
router.get('/intents/:id', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => { res.json(await pay.getIntent(String(req.params.id))); }));
router.get('/config/pix', requirePermission('core.payments:manage'), (_req, res) => { res.json(pay.configPix()); });
router.put('/config/pix', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => {
  res.json(await pay.salvarConfigPix(parse(z.object({ chave: z.string().min(5).max(80), nome: z.string().min(2).max(60), cidade: z.string().min(2).max(40) }), req.body)));
}));
/** Conta do Mercado Pago da empresa: Pix com baixa automática (o token é conferido lá e guardado selado). */
router.get('/config/mercadopago', requirePermission('core.payments:manage'), (_req, res) => { res.json(pay.configMercadoPago()); });
router.put('/config/mercadopago', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => {
  res.json(await pay.conectarMercadoPago(parse(z.object({ accessToken: z.string().trim().regex(/^(APP_USR|TEST)-[\w-]{20,}$/, 'Cole o Access Token (começa com APP_USR- ou TEST-).'), webhookSecret: z.string().trim().max(200).optional() }), req.body)));
}));
router.delete('/config/mercadopago', requirePermission('core.payments:manage'), asyncHandler(async (_req, res) => { res.json(await pay.desconectarMercadoPago()); }));
router.post('/intents/:id/confirm', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => { res.json(await pay.confirmManual(String(req.params.id))); }));
router.post('/intents/:id/cancel', requirePermission('core.payments:manage'), asyncHandler(async (req, res) => { res.json(await pay.cancelIntent(String(req.params.id))); }));
export default router;

/** Público: o gateway chama aqui. A autenticidade é do provedor (assinatura/token). */
export const publicRouter = Router();
publicRouter.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
/** Link de pagamento que a empresa manda ao cliente (WhatsApp, e-mail): Pix e situação. */
publicRouter.get('/link/:token', asyncHandler(async (req, res) => { res.json(await pay.paginaDePagamento(String(req.params.token))); }));
publicRouter.post('/:provider/webhook', asyncHandler(async (req, res) => {
  const r = await pay.handleWebhook(String(req.params.provider), req.headers as Record<string, string | string[] | undefined>, req.body);
  res.json({ ok: true, status: r.status });
}));
