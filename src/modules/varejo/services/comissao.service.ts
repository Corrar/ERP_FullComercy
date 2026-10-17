// modules/varejo/services/comissao.service.ts — comissionamento por venda.
// Regra: a mais específica vence (vendedor+categoria > vendedor > categoria > taxa padrão do
// vendedor), por item, com vigência na data da venda.
import { Prisma } from '@prisma/client';
import type { TenantTx } from '../../../infra/prisma';
import { D, round2, sum } from '../../../shared/money';
import { ctx } from '../../../core/tenancy/tenant-context';

export async function calcularComissao(tx: TenantTx, orderId: string) {
  const sale = await tx.retailSale.findFirst({
    where: { orderId },
    include: { order: { include: { items: { include: { variant: { include: { product: { select: { categoryId: true } } } } } } } }, salesperson: { include: { rules: true } } },
  });
  if (!sale?.salesperson) return null;

  const today = new Date();
  const vigentes = sale.salesperson.rules.filter((r) => r.validFrom <= today && (!r.validTo || r.validTo >= today));
  const rateFor = (categoryId: string | null | undefined): Prisma.Decimal => {
    const pick = (f: (r: typeof vigentes[number]) => boolean) => vigentes.find(f)?.rate;
    return D(
      (categoryId && pick((r) => r.salespersonId === sale.salespersonId && r.categoryId === categoryId)) ??
      pick((r) => r.salespersonId === sale.salespersonId && !r.categoryId) ??
      (categoryId && pick((r) => !r.salespersonId && r.categoryId === categoryId)) ??
      sale.salesperson!.defaultCommissionRate,
    );
  };

  const parcelas = sale.order.items
    .filter((i) => i.kind === 'PRODUCT' || i.kind === 'SERVICE')
    .map((i) => ({ base: D(i.total), rate: rateFor(i.variant?.product.categoryId) }));
  const base = round2(sum(parcelas.map((p) => p.base)));
  const amount = round2(sum(parcelas.map((p) => p.base.mul(p.rate).div(100))));
  if (amount.lte(0)) return null;
  const rate = base.isZero() ? D(0) : round2(amount.div(base).mul(100));

  await tx.retailSale.update({ where: { id: sale.id }, data: { commissionAmount: amount } });
  return tx.retailCommission.create({
    data: { tenantId: sale.tenantId, saleId: sale.id, salespersonId: sale.salespersonId!, baseAmount: base, rate, amount },
  });
}

export async function listarComissoes(filter: { salespersonId?: string; status?: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED' }) {
  return ctx().db.retailCommission.findMany({
    where: { salespersonId: filter.salespersonId, status: filter.status },
    include: { sale: { include: { order: { select: { number: true, total: true, completedAt: true } } } }, salesperson: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }, take: 500,
  });
}
