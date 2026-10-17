// modules/servicos/services/os-sales.strategy.ts — como a OFICINA vende: a ORDEM DE SERVIÇO.
// O pedido nasce CONFIRMED (a OS existe, o carro está no pátio) e RESERVA as peças; só consome
// quando a OS conclui. O status fino (diagnóstico, aguardando peça…) vive em
// `svc_service_orders.maintenanceStatus` e é projetado no status do core (ver os.service.ts).
import { ModuleKey, OrderChannel, OrderStatus } from '@prisma/client';
import type { SalesStrategy, OrderDraft } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { normalizarPlaca } from './veiculos.service';

interface SvcModuleData { vehicleId?: string; plate?: string; mileageIn?: number; fuelLevel?: string; complaint?: string; promisedAt?: string; technicianUserId?: string }
const md = (d: OrderDraft) => (d.moduleData ?? {}) as SvcModuleData;

export const osSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.SERVICOS,
  name: 'Serviços · Ordem de Serviço',
  channels: [OrderChannel.WORKSHOP, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.CONFIRMED,
  stockPolicy: () => 'RESERVE',
  // OS não fecha por pagamento: fecha por ENTREGA do veículo (os.service.ts).
  completeOnFullPayment: () => false,

  async validate(draft) {
    const m = md(draft);
    if (!draft.customerId) throw AppError.validation('OS exige cliente.');
    if (m.vehicleId) {
      const v = await ctx().db.svcVehicle.findUnique({ where: { id: m.vehicleId } });
      if (!v) throw AppError.notFound('Veículo');
      if (v.customerId !== draft.customerId) throw AppError.validation('Veículo não pertence a este cliente.');
    } else if (m.plate && !normalizarPlaca(m.plate)) {
      throw AppError.validation('Placa inválida.');
    }
  },

  async afterCreate(tx, order, _items, draft) {
    const m = md(draft);
    let vehicleId = m.vehicleId ?? null;
    // Placa nova digitada na hora: cadastra o veículo para este cliente.
    if (!vehicleId && m.plate) {
      const plate = normalizarPlaca(m.plate)!;
      const v = await tx.svcVehicle.upsert({ where: { tenantId_plate: { tenantId: order.tenantId, plate } }, create: { tenantId: order.tenantId, plate, customerId: order.customerId! }, update: {} });
      vehicleId = v.id;
    }
    if (vehicleId && m.mileageIn) await tx.svcVehicle.update({ where: { id: vehicleId }, data: { mileage: m.mileageIn } });
    await tx.svcServiceOrder.create({
      data: {
        tenantId: order.tenantId, orderId: order.id, vehicleId, technicianUserId: m.technicianUserId ?? null,
        mileageIn: m.mileageIn ?? null, fuelLevel: m.fuelLevel ?? null, complaint: m.complaint ?? null,
        promisedAt: m.promisedAt ? new Date(m.promisedAt) : null,
        events: { create: { fromStatus: null, toStatus: 'RECEIVED', userId: ctx().userId } },
      },
    });
  },

  // A OS controla as próprias transições do core (os.service.ts); por fora só se cancela.
  allowedTransitions: () => ({
    CONFIRMED: [OrderStatus.CANCELLED],
    IN_PROGRESS: [OrderStatus.CANCELLED],
    READY: [OrderStatus.CANCELLED],
  }),

  async afterStatusChange(tx, order, _from, to) {
    if (to === OrderStatus.CANCELLED) {
      const os = await tx.svcServiceOrder.findFirst({ where: { orderId: order.id } });
      if (os && os.maintenanceStatus !== 'CANCELLED') {
        await tx.svcServiceOrder.update({ where: { id: os.id }, data: { maintenanceStatus: 'CANCELLED', events: { create: { fromStatus: os.maintenanceStatus, toStatus: 'CANCELLED', userId: ctx().userId } } } });
      }
    }
  },
};
