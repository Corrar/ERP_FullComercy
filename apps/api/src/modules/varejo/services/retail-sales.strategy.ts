// modules/varejo/services/retail-sales.strategy.ts — como o VAREJO vende.
// PDV rápido: nasce OPEN, consome estoque na hora, fecha ao pagar. Exige caixa aberto quando o
// canal é POS. Ao COMPLETAR, calcula a comissão do vendedor.
import { OrderChannel, OrderStatus, ModuleKey } from '@prisma/client';
import type { SalesStrategy } from '../../../core/orders/sales-strategy';
import { ctx, moduleConfig } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { registerPayments } from '../../../core/orders/order.service';
import { calcularComissao } from './comissao.service';

interface RetailModuleData { posSessionId?: string; salespersonId?: string; exchangeOfSaleId?: string; valeFinanceEntryId?: string }
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
    // Troca: a venda nova abate o vale da devolução (título a pagar de origem RETURN).
    if (md.valeFinanceEntryId) {
      const vale = await tx.financeEntry.findFirst({ where: { id: md.valeFinanceEntryId, origin: 'RETURN', status: { in: ['OPEN', 'PARTIAL'] } } });
      if (!vale) throw AppError.conflict('Vale inexistente ou já utilizado.');
      const { settle } = await import('../../../core/finance/finance.service');
      const { D } = await import('../../../shared/money');
      const saldo = D(vale.amount).minus(vale.paidAmount);
      const usa = saldo.lt(order.total) ? saldo : D(order.total);
      await settle(tx, order.tenantId, { entryId: vale.id, amount: usa, method: 'STORE_CREDIT', reference: `troca:${order.id}` });
      // O vale também paga a venda nova: entra pelo caminho do core (pagamento + baixa do título a
      // receber). Gravar só o pagamento deixava o a receber da venda em aberto pelo valor do vale.
      await registerPayments(tx, order, [{ method: 'STORE_CREDIT', amount: Number(usa), reference: `vale:${vale.id}` }]);
    }
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
