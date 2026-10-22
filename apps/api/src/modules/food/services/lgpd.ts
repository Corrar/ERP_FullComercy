// LGPD do food: o endereço de cada entrega fica copiado na entrega (não no cadastro), então sai
// aqui. Entrega em curso já bloqueia pelo pedido aberto, no núcleo.
import { Prisma } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const foodLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const entregas = await ctx().db.foodDelivery.findMany({
      where: { foodOrder: { order: { customerId } } }, orderBy: { createdAt: 'asc' },
      include: { foodOrder: { select: { order: { select: { number: true } } } } },
    });
    return { entregas: entregas.map((e) => ({ pedido: e.foodOrder.order.number, endereco: e.address, taxa: e.fee, situacao: e.status, entregueEm: e.deliveredAt })) };
  },
  async anonimizar(customerId, tx) {
    await tx.foodDelivery.updateMany({ where: { foodOrder: { order: { customerId } } }, data: { address: { anonimizado: true } as Prisma.InputJsonValue } });
  },
};
