// modules/food/services/cozinha.service.ts — o fluxo de status da cozinha (KDS).
// Um pedido vira N tickets, um por estação. O status do PEDIDO na cozinha é a projeção dos
// tickets: todos READY → pedido READY; e isso se projeta no core como READY também.
import { KitchenStatus, OrderStatus } from '@prisma/client';
import type { TenantTx } from '../../../infra/prisma';
import type { OrderWithItems, PricedItem } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';

export async function abrirTicketsDeCozinha(tx: TenantTx, foodOrderId: string, order: OrderWithItems, items: PricedItem[]) {
  // Os itens persistidos (com id) estão em `order.items`, na mesma ordem dos `items` precificados.
  const porEstacao = new Map<string, { orderItemId: string; display: Record<string, unknown> }[]>();
  items.forEach((it, i) => {
    if (it.kind !== 'PRODUCT') return;
    const station = String(it.metadata.station ?? 'COZINHA');
    const lista = porEstacao.get(station) ?? [];
    lista.push({ orderItemId: order.items[i].id, display: { nome: it.description, qtd: it.quantity, modifiers: it.metadata.modifiers ?? [], obs: it.metadata.obs ?? null } });
    porEstacao.set(station, lista);
  });
  for (const [station, lista] of porEstacao) {
    await tx.foodKitchenTicket.create({
      data: { tenantId: order.tenantId, foodOrderId, station, items: { create: lista.map((l) => ({ orderItemId: l.orderItemId, display: l.display as never })) } },
    });
  }
}

const FLUXO: Record<KitchenStatus, KitchenStatus[]> = {
  QUEUED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export async function moverTicket(ticketId: string, to: KitchenStatus) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const t = await tx.foodKitchenTicket.findUnique({ where: { id: ticketId }, include: { foodOrder: true } });
    if (!t) throw AppError.notFound('Ticket');
    if (!FLUXO[t.status].includes(to)) throw new AppError('INVALID_TRANSITION', `Ticket ${t.status} → ${to} não permitido.`);
    await tx.foodKitchenTicket.update({
      where: { id: ticketId },
      data: { status: to, startedAt: to === 'PREPARING' ? new Date() : undefined, readyAt: to === 'READY' ? new Date() : undefined, items: { updateMany: { where: {}, data: { status: to } } } },
    });
    // Projeção: pior status entre os tickets vivos define o do pedido.
    const tickets = await tx.foodKitchenTicket.findMany({ where: { foodOrderId: t.foodOrderId, status: { not: 'CANCELLED' } }, select: { status: true } });
    const ordem: KitchenStatus[] = ['QUEUED', 'PREPARING', 'READY', 'SERVED'];
    const pior = tickets.reduce<KitchenStatus>((acc, k) => (ordem.indexOf(k.status) < ordem.indexOf(acc) ? k.status : acc), 'SERVED');
    await tx.foodOrder.update({ where: { id: t.foodOrderId }, data: { kitchenStatus: pior } });
    const coreStatus = pior === 'PREPARING' ? OrderStatus.IN_PROGRESS : pior === 'READY' ? OrderStatus.READY : null;
    if (coreStatus) {
      await tx.order.updateMany({ where: { id: t.foodOrder.orderId, status: { in: ['OPEN', 'CONFIRMED', 'IN_PROGRESS'] } }, data: { status: coreStatus } });
    }
    return { ticketId, status: to, kitchenStatus: pior };
  });
}

export async function filaDaEstacao(station?: string) {
  return ctx().db.foodKitchenTicket.findMany({
    where: { station, status: { in: ['QUEUED', 'PREPARING'] } },
    include: { items: true, foodOrder: { include: { table: { select: { number: true } }, tab: { select: { code: true } }, order: { select: { number: true, createdAt: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
}
