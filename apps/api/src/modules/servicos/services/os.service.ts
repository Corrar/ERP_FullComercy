// modules/servicos/services/os.service.ts — o status de manutenção e sua projeção no core.
import { MaintenanceStatus, OrderStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import * as stock from '../../../core/inventory/stock.service';
import { defaultWarehouseId } from '../../../core/inventory/products.service';
import { events } from '../../../shared/events';

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
    events.emit('os.status', { tenantId, serviceOrderId: os.id, status: to });
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

// ── Detalhe, orçamento e aprovação ──
export async function detalheOS(id: string) {
  const os = await ctx().db.svcServiceOrder.findUnique({
    where: { id },
    include: {
      order: { include: { items: true, payments: true, customer: true } }, vehicle: true, technician: { select: { id: true, name: true } },
      events: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }, checklist: { orderBy: { phase: 'asc' } }, attachments: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!os) throw AppError.notFound('OS');
  return { ...os, events: os.events.map((e) => ({ ...e, id: e.id.toString() })) };
}

export const porPedido = async (orderId: string) => {
  const os = await ctx().db.svcServiceOrder.findFirst({ where: { orderId }, select: { id: true } });
  if (!os) throw AppError.notFound('OS');
  return detalheOS(os.id);
};

/** O orçamento é o pedido do core: itens entram por POST /orders/:id/items. Aqui só o texto
 *  do laudo + a passagem para AWAITING_APPROVAL, e a aprovação (que libera o serviço). */
export async function enviarOrcamento(id: string, diagnosis: string) {
  return moverOS(id, 'AWAITING_APPROVAL', { diagnosis, note: 'Orçamento enviado ao cliente' });
}
export async function aprovarOrcamento(id: string, input: { aprovadoPor: string; canal?: string; itensRecusados?: string[] }) {
  const { db } = ctx();
  const os = await db.svcServiceOrder.findUnique({ where: { id } });
  if (!os) throw AppError.notFound('OS');
  // Itens que o cliente recusou saem do pedido (liberando reserva de peça).
  const orders = await import('../../../core/orders/order.service');
  for (const itemId of input.itensRecusados ?? []) await orders.removeItem(os.orderId, itemId, 'Recusado pelo cliente no orçamento');
  return moverOS(id, 'APPROVED', { note: `Aprovado por ${input.aprovadoPor}${input.canal ? ` via ${input.canal}` : ''}` });
}

export const atribuirTecnico = (id: string, technicianUserId: string | null) => ctx().db.svcServiceOrder.update({ where: { id }, data: { technicianUserId } });
export const atualizarOS = (id: string, input: { promisedAt?: Date | null; warrantyDays?: number | null; complaint?: string; diagnosis?: string; mileageIn?: number; fuelLevel?: string }) =>
  ctx().db.svcServiceOrder.update({ where: { id }, data: input });

// ── Checklist e anexos ──
const CHECKLIST_PADRAO = ['Estepe', 'Macaco e chave de roda', 'Triângulo', 'Extintor', 'Documento no porta-luvas', 'Som/multimídia', 'Tapetes', 'Riscos/amassados (anotar)', 'Nível de combustível'];
export async function criarChecklist(id: string, phase: 'IN' | 'OUT', labels = CHECKLIST_PADRAO) {
  const { db, tenantId } = ctx();
  await db.svcChecklistItem.createMany({ data: labels.map((label) => ({ tenantId, serviceOrderId: id, phase, label })) });
  return db.svcChecklistItem.findMany({ where: { serviceOrderId: id, phase } });
}
export const marcarChecklist = (itemId: string, input: { checked: boolean; note?: string; photoUrl?: string }) => ctx().db.svcChecklistItem.update({ where: { id: itemId }, data: input });
export const anexar = (id: string, input: { kind: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE'; url: string; caption?: string }) => ctx().db.svcAttachment.create({ data: { ...input, tenantId: ctx().tenantId, serviceOrderId: id } });

// ── Relatórios ──
export const osPorStatus = () => ctx().db.svcServiceOrder.groupBy({ by: ['maintenanceStatus'], _count: true });
export const produtividadeTecnicos = (from: Date, to: Date) => ctx().db.$queryRaw<{ tecnico: string; os_entregues: number; faturado: string; tempo_medio_h: number | null }[]>`
  SELECT COALESCE(u.name, '(sem técnico)') AS tecnico, COUNT(*)::int AS os_entregues, SUM(o.total)::text AS faturado,
         AVG(EXTRACT(EPOCH FROM (s.finished_at - s.started_at)) / 3600)::float AS tempo_medio_h
    FROM svc_service_orders s JOIN core_orders o ON o.id = s.order_id LEFT JOIN core_users u ON u.id = s.technician_user_id
   WHERE s.tenant_id = ${ctx().tenantId}::uuid AND s.maintenance_status = 'DELIVERED' AND s.delivered_at BETWEEN ${from} AND ${to}
   GROUP BY 1 ORDER BY 2 DESC`;
export const servicosMaisVendidos = (from: Date, to: Date) => ctx().db.$queryRaw<{ servico: string; vezes: number; total: string }[]>`
  SELECT i.description AS servico, COUNT(*)::int AS vezes, SUM(i.total)::text AS total
    FROM core_order_items i JOIN core_orders o ON o.id = i.order_id
   WHERE i.tenant_id = ${ctx().tenantId}::uuid AND o.module_key = 'SERVICOS' AND o.status = 'COMPLETED' AND i.kind = 'SERVICE' AND o.completed_at BETWEEN ${from} AND ${to}
   GROUP BY 1 ORDER BY 2 DESC LIMIT 30`;
/** Revisões a lembrar: veículos cuja última OS entregue foi há mais de N dias (régua de retorno). */
export const retornoDeClientes = (dias = 180) => ctx().db.$queryRaw<{ plate: string; modelo: string | null; cliente: string; telefone: string | null; ultima_os: Date }[]>`
  SELECT v.plate, concat_ws(' ', v.brand, v.model) AS modelo, c.name AS cliente, c.phone AS telefone, MAX(s.delivered_at) AS ultima_os
    FROM svc_vehicles v JOIN core_customers c ON c.id = v.customer_id JOIN svc_service_orders s ON s.vehicle_id = v.id
   WHERE v.tenant_id = ${ctx().tenantId}::uuid AND v.is_active AND s.maintenance_status = 'DELIVERED'
   GROUP BY v.id, c.id HAVING MAX(s.delivered_at) < now() - make_interval(days => ${dias})
   ORDER BY ultima_os ASC LIMIT 200`;
