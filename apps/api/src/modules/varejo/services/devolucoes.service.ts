// modules/varejo/services/devolucoes.service.ts — DEVOLUÇÃO e TROCA.
// Devolução: itens voltam ao estoque (se `restock`), o valor sai como título a PAGAR do core
// (origin RETURN). STORE_CREDIT deixa o título em aberto = um vale que o caixa abate depois.
// Troca: devolução + venda nova com `moduleData.exchangeOfSaleId`; o vale cobre a nova.
import { FinanceEntryKind, PaymentMethod, RefundMethod } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { tenantTransaction } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { D, round2, sum } from '../../../shared/money';
import * as stock from '../../../core/inventory/stock.service';
import * as finance from '../../../core/finance/finance.service';
import { defaultWarehouseId } from '../../../core/inventory/products.service';

export interface ReturnInput {
  saleId: string;
  refundMethod: RefundMethod;
  reason?: string;
  items: { orderItemId: string; quantity: number; restock?: boolean; condition?: string }[];
}

export async function criarDevolucao(input: ReturnInput) {
  const { db, tenantId, userId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const sale = await tx.retailSale.findUnique({ where: { id: input.saleId }, include: { order: { include: { items: true, customer: true } }, returns: { include: { items: true } } } });
    if (!sale) throw AppError.notFound('Venda');
    if (sale.order.status !== 'COMPLETED') throw AppError.conflict('Só venda concluída aceita devolução.');

    // Quanto de cada item já voltou (não se devolve mais do que se comprou).
    const jaDevolvido = new Map<string, ReturnType<typeof D>>();
    for (const r of sale.returns) for (const it of r.items) jaDevolvido.set(it.orderItemId, (jaDevolvido.get(it.orderItemId) ?? D(0)).plus(it.quantity));

    const linhas = input.items.map((i) => {
      const oi = sale.order.items.find((x) => x.id === i.orderItemId);
      if (!oi) throw AppError.notFound(`Item ${i.orderItemId}`);
      const qty = D(i.quantity);
      const disponivel = D(oi.quantity).minus(jaDevolvido.get(oi.id) ?? 0);
      if (qty.lte(0) || qty.gt(disponivel)) throw AppError.validation(`Item "${oi.description}": pode devolver no máximo ${disponivel}.`);
      // Valor proporcional ao que foi pago pela linha (já com desconto da linha).
      const amount = round2(D(oi.total).div(oi.quantity).mul(qty));
      return { oi, qty, amount, restock: i.restock ?? true, condition: i.condition };
    });
    const total = round2(sum(linhas.map((l) => l.amount)));

    const ret = await tx.retailReturn.create({
      data: {
        tenantId, saleId: sale.id, refundMethod: input.refundMethod, reason: input.reason, userId, totalAmount: total,
        status: input.refundMethod === RefundMethod.STORE_CREDIT || input.refundMethod === RefundMethod.EXCHANGE ? 'APPROVED' : 'REFUNDED',
        resolvedAt: new Date(),
        items: { create: linhas.map((l) => ({ orderItemId: l.oi.id, quantity: l.qty, amount: l.amount, restock: l.restock, condition: l.condition })) },
      },
    });

    const warehouseId = sale.order.warehouseId ?? (await defaultWarehouseId());
    for (const l of linhas) {
      if (l.restock && l.oi.variantId) {
        await stock.receive(tx, { tenantId, variantId: l.oi.variantId, warehouseId }, l.qty, { refType: 'RETURN', refId: ret.id, userId, idempotencyKey: `return:${ret.id}:${l.oi.id}`, note: `Devolução venda #${sale.order.number}` });
      }
    }

    if (input.refundMethod !== RefundMethod.EXCHANGE) {
      const entry = await finance.createEntry(tx, tenantId, {
        kind: FinanceEntryKind.PAYABLE, description: `Devolução venda #${sale.order.number}`, amount: total, dueDate: new Date(),
        customerId: sale.order.customerId, orderId: sale.orderId, origin: 'RETURN', originId: ret.id,
      });
      if (input.refundMethod !== RefundMethod.STORE_CREDIT) {
        const method: PaymentMethod = input.refundMethod === 'CASH' ? 'CASH' : input.refundMethod === 'PIX' ? 'PIX' : 'CREDIT';
        await finance.settle(tx, tenantId, { entryId: entry.id, amount: total, method, reference: `estorno:${ret.id}` });
      }
    }
    await tx.auditLog.create({ data: { tenantId, userId, action: 'retail.return', entity: 'RetailReturn', entityId: ret.id, details: { saleId: sale.id, total, method: input.refundMethod } } });
    return ret;
  });
}

export const listarDevolucoes = (filter: { saleId?: string; from?: Date; to?: Date }) =>
  ctx().db.retailReturn.findMany({ where: { saleId: filter.saleId, createdAt: { gte: filter.from, lte: filter.to } }, include: { items: { include: { orderItem: { select: { description: true } } } }, sale: { include: { order: { select: { number: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });

/** Vales (crédito em loja) em aberto de um cliente: títulos PAYABLE de origem RETURN não baixados. */
export const valesDoCliente = (customerId: string) =>
  ctx().db.financeEntry.findMany({ where: { customerId, kind: 'PAYABLE', origin: 'RETURN', status: { in: ['OPEN', 'PARTIAL'] } }, orderBy: { createdAt: 'asc' } });
