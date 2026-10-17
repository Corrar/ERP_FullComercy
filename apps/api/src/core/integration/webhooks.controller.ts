import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { ctx } from '../tenancy/tenant-context';
import { seal } from '../../shared/crypto';
import { AppError } from '../../shared/errors';
import { dispatchPending } from './outbox.service';

export const EVENT_TYPES = ['*', 'order.created', 'order.status', 'order.paid', 'stock.low', 'kitchen.ticket', 'delivery.status', 'gym.access', 'os.status', 'purchase.received', 'payment.paid'];

export const getWebhooks = async (_req: Request, res: Response) => res.json({ tipos: EVENT_TYPES, webhooks: await ctx().db.webhook.findMany({ select: { id: true, url: true, events: true, isActive: true, createdAt: true, _count: { select: { deliveries: true } } }, orderBy: { createdAt: 'desc' } }) });

/** Cria e devolve o segredo UMA vez (no banco fica cifrado). */
export const postWebhook = async (req: Request, res: Response) => {
  const b = parse(z.object({ url: z.string().url().refine((u) => u.startsWith('https://') || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u), 'Webhook exige https (localhost liberado para teste)'), events: z.array(z.string()).min(1).refine((e) => e.every((t) => EVENT_TYPES.includes(t)), 'tipo de evento desconhecido') }), req.body);
  const secret = randomBytes(32).toString('base64url');
  const w = await ctx().db.webhook.create({ data: { tenantId: ctx().tenantId, url: b.url, events: b.events, secret: seal(secret) } });
  res.status(201).json({ id: w.id, url: w.url, events: w.events, secret });
};
export const patchWebhook = async (req: Request, res: Response) => {
  const b = parse(z.object({ url: z.string().url().optional(), events: z.array(z.string()).min(1).optional(), isActive: z.boolean().optional() }), req.body);
  res.json(await ctx().db.webhook.update({ where: { id: String(req.params.id) }, data: b, select: { id: true, url: true, events: true, isActive: true } }));
};
export const getDeliveries = async (req: Request, res: Response) => {
  const rows = await ctx().db.webhookDelivery.findMany({ where: { webhookId: String(req.params.id) }, include: { event: { select: { eventType: true, occurredAt: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(rows.map((r) => ({ ...r, id: r.id.toString(), outboxEventId: r.outboxEventId.toString() })));
};
export const getEvents = async (req: Request, res: Response) => {
  const q = parse(z.object({ type: z.string().optional(), status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(), take: z.coerce.number().int().max(500).default(100) }), req.query);
  const rows = await ctx().db.outboxEvent.findMany({ where: { eventType: q.type, status: q.status }, orderBy: { id: 'desc' }, take: q.take });
  res.json(rows.map((r) => ({ ...r, id: r.id.toString() })));
};
/** Reenfileira um evento FAILED (depois de consertar o endpoint). */
export const postRetry = async (req: Request, res: Response) => {
  const id = BigInt(String(req.params.id));
  const ev = await ctx().db.outboxEvent.findFirst({ where: { id } });
  if (!ev) throw AppError.notFound('Evento');
  await ctx().db.outboxEvent.update({ where: { id }, data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0, lastError: null } });
  res.json({ ok: true });
};
/** Despacha agora (útil em teste e quando os jobs estão desligados). */
export const postDispatch = async (_req: Request, res: Response) => res.json(await dispatchPending());
