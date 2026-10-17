// src/core/integration/outbox.service.ts — do evento em memória ao webhook entregue.
//
// 1. `startOutboxPersistence()` ouve TODOS os eventos do barramento e grava `core_outbox_events`
//    (client de plataforma: o tenant vem no payload). A partir daí o evento sobrevive a restart.
// 2. `dispatchPending()` (job) pega eventos PENDING vencidos, acha os webhooks ATIVOS da empresa
//    inscritos naquele tipo (ou '*'), faz o POST assinado (HMAC-SHA256 do corpo, `X-FC-Signature`)
//    e registra a entrega. Falha → backoff (1m, 5m, 30m, 2h, 12h) → FAILED na 6ª.
// Empresa sem webhook: o evento vira SENT na hora (não há para quem entregar), mas fica
// gravado — é também a trilha de auditoria de "o que aconteceu".
import { createHmac } from 'node:crypto';
import { OutboxStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infra/prisma';
import { events, type DomainEvents } from '../../shared/events';
import { open } from '../../shared/crypto';

const TYPES = ['order.created', 'order.status', 'order.paid', 'stock.low', 'kitchen.ticket', 'delivery.status', 'gym.access', 'os.status', 'purchase.received', 'payment.paid'] as const satisfies readonly (keyof DomainEvents)[];
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

let started = false;
export function startOutboxPersistence() {
  if (started) return; started = true;
  for (const t of TYPES) {
    events.on(t, async (p) => {
      try { await prisma.outboxEvent.create({ data: { tenantId: p.tenantId, eventType: t, payload: p as unknown as Prisma.InputJsonValue } }); }
      catch (e) { console.error('[outbox] falha ao gravar evento', t, e instanceof Error ? e.message : e); }
    });
  }
}

export const sign = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

async function deliver(url: string, secret: string, body: string, eventType: string, eventId: bigint): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8_000);
  try {
    const res = await fetch(url, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': 'FullComercy-Webhook/1', 'x-fc-event': eventType, 'x-fc-event-id': eventId.toString(), 'x-fc-signature': sign(secret, body) }, body });
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  finally { clearTimeout(t); }
}

export async function dispatchPending(limit = 100) {
  const now = new Date();
  const pend = await prisma.outboxEvent.findMany({ where: { status: OutboxStatus.PENDING, nextAttemptAt: { lte: now } }, orderBy: { id: 'asc' }, take: limit });
  let sent = 0, failed = 0, deliveries = 0;
  for (const ev of pend) {
    const hooks = await prisma.webhook.findMany({ where: { tenantId: ev.tenantId, isActive: true, OR: [{ events: { has: ev.eventType } }, { events: { has: '*' } }] } });
    const body = JSON.stringify({ id: ev.id.toString(), type: ev.eventType, occurredAt: ev.occurredAt, tenantId: ev.tenantId, data: ev.payload });
    let allOk = true;
    for (const h of hooks) {
      const r = await deliver(h.url, open(h.secret), body, ev.eventType, ev.id);
      deliveries++;
      await prisma.webhookDelivery.create({ data: { tenantId: ev.tenantId, webhookId: h.id, outboxEventId: ev.id, status: r.ok ? 'SENT' : 'FAILED', attempts: ev.attempts + 1, responseStatus: r.status ?? null, lastError: r.error ?? null, sentAt: r.ok ? new Date() : null } });
      if (!r.ok) allOk = false;
    }
    if (allOk) { await prisma.outboxEvent.update({ where: { id: ev.id }, data: { status: OutboxStatus.SENT, sentAt: new Date(), attempts: ev.attempts + 1 } }); sent++; }
    else {
      const n = ev.attempts + 1; const esgotou = n >= BACKOFF_MS.length + 1;
      await prisma.outboxEvent.update({ where: { id: ev.id }, data: { attempts: n, status: esgotou ? OutboxStatus.FAILED : OutboxStatus.PENDING, nextAttemptAt: new Date(Date.now() + (BACKOFF_MS[n - 1] ?? BACKOFF_MS.at(-1)!)), lastError: 'uma ou mais entregas falharam' } });
      failed++;
    }
  }
  return { processados: pend.length, enviados: sent, comFalha: failed, entregas: deliveries };
}
