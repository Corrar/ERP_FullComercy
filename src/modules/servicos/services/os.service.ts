// modules/servicos/services/os.service.ts — o status de manutenção e sua projeção no core.
import { MaintenanceStatus, OrderStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import * as stock from '../../../core/inventory/stock.service';
import { defaultWarehouseId } from '../../../core/inventory/products.service';

const FLUXO: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  RECEIVED:          ['DIAGNOSING', 'AWAITING_APPROVAL', 'CANCELLED'],
  DIAGNOSING:        ['AWAITING_APPROVAL', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED:          ['IN_SERVICE', 'AWAITING_PARTS', 'CANCELLED'],
  AWAITING_PARTS:    ['IN_SERVICE', 'CANCELLED'],
  IN_SERVICE:        ['AWAITING_PARTS', 'QUALITY_CHECK', 'READY', 'CANCELLED'],
  QUALITY_CHECK:     ['IN_SERVICE', 'READY'],
  READY:             ['DELIVERED'],
  DELIVERED:         [],
  CANCELLED:         [],
};

/** Projeção manutenção → core. Só os marcos que o core entende. */
const PROJECAO: Partial<Record<MaintenanceStatus, OrderStatus>> = {
  APPROVED: OrderStatus.CONFIRMED,
  IN_SERVICE: OrderStatus.IN_PROGRESS,
  READY: OrderStatus.READY,
  DELIVERED: OrderStatus.COMPLETED,
  CANCELLED: OrderStatus.CANCELLED,
};

export async function moverOS(serviceOrderId: string, to: MaintenanceStatus, input: { note?: string; diagnosis?: string } = {}) {
  const { db, tenantId, userId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const os = await tx.svcServiceOrder.findUnique({ where: { id: serviceOrderId }, include: { order: { include: { items: true, payments: true } } } });
    if (!os) throw AppError.notFound('OS');
    if (!FLUXO[os.maintenanceStatus].includes(to)) throw new AppError('INVALID_TRANSITION', `OS ${os.maintenanceStatus} → ${to} não permitida.`);
    if (to === 'CANCELLED') throw AppError.validation('Cancele pela rota do pedido (POST /orders/:id/cancel): ela estorna peças e títulos.');

    // ENTREGA: só com conta paga; consome as peças reservadas.
    if (to === 'DELIVERED') {
      const pago = os.order.payments.reduce((s, p) => s.plus(p.amount), D(0));
      if (pago.lt(os.order.total)) throw AppError.conflict(`OS não está quitada (faltam ${D(os.order.total).minus(pago)}).`);
      const warehouseId = os.order.warehouseId ?? (await defaultWarehouseId());
      const pecas = os.order.items.filter((i) => i.variantId && i.kind === 'PRODUCT');
      for (const [i, it] of pecas.entries()) {
        await stock.consume(tx, { tenantId, variantId: it.variantId!, warehouseId }, D(it.quantity), { refType: 'OS', refId: os.id, userId, idempotencyKey: `order:${os.orderId}:complete:${i}` }, true);
      }
    }

    const agora = new Date();
    const upd = await tx.svcServiceOrder.update({
      where: { id: os.id },
      data: {
        maintenanceStatus: to, diagnosis: input.diagnosis ?? os.diagnosis,
        approvedAt: to === 'APPROVED' ? agora : undefined, startedAt: to === 'IN_SERVICE' && !os.startedAt ? agora : undefined,
        finishedAt: to === 'READY' ? agora : undefined, deliveredAt: to === 'DELIVERED' ? agora : undefined,
        events: { create: { fromStatus: os.maintenanceStatus, toStatus: to, userId, note: input.note ?? null } },
      },
    });
    const core = PROJECAO[to];
    if (core) {
      await tx.order.update({ where: { id: os.orderId }, data: { status: core, completedAt: core === 'COMPLETED' ? agora : undefined } });
      await tx.orderStatusHistory.create({ data: { tenantId, orderId: os.orderId, fromStatus: os.order.status, toStatus: core, userId, note: `OS → ${to}` } });
    }
    return upd;
  });
}

export async function painel() {
  return ctx().db.svcServiceOrder.findMany({
    where: { maintenanceStatus: { notIn: ['DELIVERED', 'CANCELLED'] } },
    include: { vehicle: { select: { plate: true, brand: true, model: true } }, technician: { select: { name: true } }, order: { select: { number: true, total: true, customer: { select: { name: true, phone: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
}
