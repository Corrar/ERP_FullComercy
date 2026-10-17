// modules/varejo/services/retail-sales.strategy.ts — como o VAREJO vende.
// PDV rápido: nasce OPEN, consome estoque na hora, fecha ao pagar. Exige caixa aberto quando o
// canal é POS. Ao COMPLETAR, calcula a comissão do vendedor.
import { OrderChannel, OrderStatus, ModuleKey } from '@prisma/client';
import type { SalesStrategy } from '../../../core/orders/sales-strategy';
import { ctx, moduleConfig } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { calcularComissao } from './comissao.service';

interface RetailModuleData { posSessionId?: string; salespersonId?: string; exchangeOfSaleId?: string }
interface RetailConfig { exigirCaixaAberto?: boolean }

export const retailSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.VAREJO,
  name: 'Varejo · PDV',
  channels: [OrderChannel.POS, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',
  completeOnFullPayment: () => true,

  async validate(draft) {
    const md = (draft.moduleData ?? {}) as RetailModuleData;
    const cfg = moduleConfig<RetailConfig>(ModuleKey.VAREJO);
    if ((draft.channel ?? OrderChannel.POS) === OrderChannel.POS && (cfg.exigirCaixaAberto ?? true)) {
      if (!md.posSessionId) throw AppError.validation('Venda de PDV exige caixa aberto (moduleData.posSessionId).');
      const s = await ctx().db.retailPosSession.findUnique({ where: { id: md.posSessionId } });
      if (!s || s.status !== 'OPEN') throw AppError.conflict('Caixa fechado ou inexistente.');
    }
    if (md.salespersonId) {
      const sp = await ctx().db.retailSalesperson.findUnique({ where: { id: md.salespersonId } });
      if (!sp?.isActive) throw AppError.validation('Vendedor inválido ou inativo.');
    }
  },

  async afterCreate(tx, order, _items, draft) {
    const md = (draft.moduleData ?? {}) as RetailModuleData;
    await tx.retailSale.create({
      data: {
        tenantId: order.tenantId, orderId: order.id,
        posSessionId: md.posSessionId ?? null, salespersonId: md.salespersonId ?? null,
        exchangeOfSaleId: md.exchangeOfSaleId ?? null,
      },
    });
  },

  async afterStatusChange(tx, order, _from, to) {
    if (to === OrderStatus.COMPLETED) await calcularComissao(tx, order.id);
    if (to === OrderStatus.CANCELLED) {
      await tx.retailCommission.updateMany({ where: { sale: { orderId: order.id }, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'CANCELLED' } });
    }
  },
};
