// modules/pet/services/pet-sales.strategy.ts — como o PET SHOP vende: balcão (ração, acessório) e
// a ENTREGA do banho/tosa. A linha do banho traz `metadata.groomingId` e o preço do agendamento,
// não o do cliente HTTP. Pago o pedido, o banho vira DELIVERED; estornado, volta a "pronto".
import { ModuleKey, OrderChannel, OrderStatus } from '@prisma/client';
import type { OrderDraft, SalesStrategy } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';

interface PetModuleData { petId?: string; groomingId?: string }
const md = (d: OrderDraft) => (d.moduleData ?? {}) as PetModuleData;
const groomingDe = (i: { metadata: unknown }) => ((i.metadata ?? {}) as { groomingId?: string }).groomingId;

export const petSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.PET,
  name: 'Pet · Balcão e banho/tosa',
  channels: [OrderChannel.PETSHOP, OrderChannel.POS, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',
  completeOnFullPayment: () => true,

  async validate(draft) {
    const m = md(draft); const { db } = ctx();
    if (m.petId) {
      const p = await db.petAnimal.findUnique({ where: { id: m.petId } });
      if (!p) throw AppError.notFound('Pet');
      if (draft.customerId && p.customerId !== draft.customerId) throw AppError.validation('O pet é de outro tutor.');
    }
    if (m.groomingId) {
      const g = await db.petGrooming.findUnique({ where: { id: m.groomingId }, include: { pet: true } });
      if (!g) throw AppError.notFound('Banho/tosa');
      if (g.orderId || ['DELIVERED', 'CANCELLED', 'NO_SHOW'].includes(g.status)) throw AppError.conflict('Este banho já foi cobrado, cancelado ou não aconteceu.');
      if (draft.customerId && g.pet.customerId !== draft.customerId) throw AppError.validation('O banho é de pet de outro tutor.');
      if (m.petId && m.petId !== g.petId) throw AppError.validation('O banho é de outro pet.');
    }
  },

  async price(items, draft) {
    const m = md(draft); const { db } = ctx();
    return Promise.all(items.map(async (it) => {
      const gid = groomingDe(it);
      if (!gid) return it;
      if (gid !== m.groomingId) throw AppError.validation('Linha de banho sem o banho no pedido (moduleData.groomingId).');
      const g = await db.petGrooming.findUniqueOrThrow({ where: { id: gid } });
      const unitPrice = D(g.price);
      return { ...it, description: `Banho/tosa: ${g.services}`, unitPrice, quantity: D(1), total: round2(unitPrice.minus(it.discount)) };
    }));
  },

  async afterCreate(tx, order, _items, draft) {
    const m = md(draft);
    const g = m.groomingId ? await tx.petGrooming.findUnique({ where: { id: m.groomingId } }) : null;
    await tx.petSale.create({ data: { tenantId: order.tenantId, orderId: order.id, petId: m.petId ?? g?.petId ?? null, groomingId: g?.id ?? null } });
    if (g) {
      const r = await tx.petGrooming.updateMany({ where: { id: g.id, orderId: null }, data: { orderId: order.id } });
      if (!r.count) throw AppError.conflict('Este banho já foi cobrado.');
    }
  },

  async afterStatusChange(tx, order, _from, to) {
    const sale = await tx.petSale.findFirst({ where: { orderId: order.id } });
    if (!sale?.groomingId) return;
    if (to === OrderStatus.COMPLETED) await tx.petGrooming.update({ where: { id: sale.groomingId }, data: { status: 'DELIVERED' } });
    if (to === OrderStatus.CANCELLED) await tx.petGrooming.update({ where: { id: sale.groomingId }, data: { status: 'READY', orderId: null } });
  },
};
