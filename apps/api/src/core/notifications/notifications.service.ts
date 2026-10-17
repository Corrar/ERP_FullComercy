// src/core/notifications/notifications.service.ts — o SINO.
// Quem cria é o barramento de eventos (listeners abaixo) ou um service explicitamente.
// `userId` NULL = para a empresa inteira; a leitura é por pessoa (NotificationRead).
import { prisma } from '../../infra/prisma';
import { ctx } from '../tenancy/tenant-context';
import { events } from '../../shared/events';
import { emitToTenant, emitToUser } from '../../infra/realtime';

export interface NotifyInput { tenantId: string; userId?: string | null; kind: string; title: string; body?: string; link?: string }

export async function notify(input: NotifyInput) {
  const n = await prisma.notification.create({ data: { tenantId: input.tenantId, userId: input.userId ?? null, kind: input.kind, title: input.title, body: input.body, link: input.link } });
  if (input.userId) emitToUser(input.userId, 'notification', n); else emitToTenant(input.tenantId, 'notification', n);
  return n;
}

let started = false;
/** Os avisos que nascem de eventos. Deliberadamente POUCOS: sino que grita toda hora é ignorado. */
export function startNotificationListeners() {
  if (started) return; started = true;
  events.on('stock.low', (p) => notify({ tenantId: p.tenantId, kind: 'stock.low', title: 'Estoque no mínimo', body: `Saldo ${p.onHand} (mínimo ${p.minLevel}).`, link: `/estoque?variant=${p.variantId}` }));
  events.on('delivery.status', (p) => { if (p.status === 'FAILED') void notify({ tenantId: p.tenantId, kind: 'delivery.failed', title: 'Entrega falhou', link: `/entregas/${p.deliveryId}` }); });
  events.on('os.status', (p) => { if (p.status === 'READY') void notify({ tenantId: p.tenantId, kind: 'os.ready', title: 'Veículo pronto para retirada', link: `/os/${p.serviceOrderId}` }); if (p.status === 'AWAITING_APPROVAL') void notify({ tenantId: p.tenantId, kind: 'os.budget', title: 'Orçamento aguardando o cliente', link: `/os/${p.serviceOrderId}` }); });
  events.on('payment.paid', (p) => notify({ tenantId: p.tenantId, kind: 'payment.paid', title: 'Pagamento online confirmado', body: `R$ ${p.amount}`, link: p.orderId ? `/pedidos/${p.orderId}` : undefined }));
  events.on('purchase.received', (p) => notify({ tenantId: p.tenantId, kind: 'purchase.received', title: `Compra #${p.number} recebida`, link: `/compras/${p.purchaseOrderId}` }));
}

export async function listMine(onlyUnread = false, take = 50) {
  const { db, userId } = ctx();
  const rows = await db.notification.findMany({
    where: { OR: [{ userId: null }, { userId: userId! }], ...(onlyUnread ? { reads: { none: { userId: userId! } } } : {}) },
    include: { reads: { where: { userId: userId! }, select: { readAt: true } } }, orderBy: { createdAt: 'desc' }, take,
  });
  return rows.map(({ reads, ...n }) => ({ ...n, readAt: reads[0]?.readAt ?? null }));
}
export async function unreadCount() {
  const { db, userId } = ctx();
  return db.notification.count({ where: { OR: [{ userId: null }, { userId: userId! }], reads: { none: { userId: userId! } } } });
}
export async function markRead(ids: string[] | 'all') {
  const { db, userId, tenantId } = ctx();
  const alvo = ids === 'all' ? (await db.notification.findMany({ where: { OR: [{ userId: null }, { userId: userId! }], reads: { none: { userId: userId! } } }, select: { id: true } })).map((n) => n.id) : ids;
  await db.notificationRead.createMany({ data: alvo.map((notificationId) => ({ tenantId, notificationId, userId: userId! })), skipDuplicates: true });
  return { lidas: alvo.length };
}
