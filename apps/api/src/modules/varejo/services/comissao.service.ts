// modules/varejo/services/comissao.service.ts — comissionamento por venda.
// Regra: a mais específica vence (vendedor+categoria > vendedor > categoria > taxa padrão do
// vendedor), por item, com vigência na data da venda.
import { Prisma } from '@prisma/client';
import type { TenantTx } from '../../../infra/prisma';
import { D, round2, sum } from '../../../shared/money';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';

export async function calcularComissao(tx: TenantTx, orderId: string) {
  const sale = await tx.retailSale.findFirst({
    where: { orderId },
    include: { order: { include: { items: { include: { variant: { include: { product: { select: { categoryId: true } } } } } } } }, salesperson: true },
  });
  if (!sale?.salesperson) return null;

  // Regras do vendedor E as gerais (sem vendedor): `salesperson.rules` só traz as dele, e a regra
  // geral por categoria nunca chegava aqui.
  const today = new Date();
  const regras = await tx.retailCommissionRule.findMany({ where: { OR: [{ salespersonId: sale.salespersonId }, { salespersonId: null }] }, orderBy: { validFrom: 'desc' } });
  // Mais de uma regra vigente no mesmo nível: vale a de vigência mais recente.
  const vigentes = regras.filter((r) => r.validFrom <= today && (!r.validTo || r.validTo >= today));
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

export const listarRegras = () => ctx().db.retailCommissionRule.findMany({ include: { salesperson: { select: { name: true } }, category: { select: { name: true } } }, orderBy: { validFrom: 'desc' } });
export function criarRegra(input: { salespersonId?: string; categoryId?: string; rate: number; validFrom: Date; validTo?: Date }) {
  // Sem vendedor e sem categoria a regra não casaria com nada: "todos em tudo" é a taxa padrão.
  if (!input.salespersonId && !input.categoryId) throw AppError.validation('Escolha um vendedor, uma categoria ou os dois. Para a taxa geral de um vendedor, use a taxa padrão dele.');
  if (input.validTo && input.validTo < input.validFrom) throw AppError.validation('O fim da vigência é antes do início.');
  return ctx().db.retailCommissionRule.create({ data: { ...input, tenantId: ctx().tenantId } });
}
export const removerRegra = (id: string) => ctx().db.retailCommissionRule.delete({ where: { id } });

export async function aprovarComissoes(ids: string[]) {
  return ctx().db.retailCommission.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'APPROVED' } });
}

/** Pagamento das comissões aprovadas de um vendedor num período: vira UM título a pagar. */
export async function pagarComissoes(salespersonId: string, until: Date) {
  const { db, tenantId } = ctx();
  const { tenantTransaction } = await import('../../../infra/prisma');
  const finance = await import('../../../core/finance/finance.service');
  return tenantTransaction(db, tenantId, async (tx) => {
    const pend = await tx.retailCommission.findMany({ where: { salespersonId, status: 'APPROVED', createdAt: { lte: until } }, include: { salesperson: true } });
    if (!pend.length) return { pagas: 0, total: D(0) };
    const total = round2(sum(pend.map((c) => D(c.amount))));
    const entry = await finance.createEntry(tx, tenantId, { kind: 'PAYABLE', description: `Comissões ${pend[0].salesperson.name} até ${until.toISOString().slice(0, 10)}`, amount: total, dueDate: new Date(), origin: 'COMMISSION', originId: salespersonId });
    await tx.retailCommission.updateMany({ where: { id: { in: pend.map((c) => c.id) } }, data: { status: 'PAID', paidAt: new Date() } });
    return { pagas: pend.length, total, financeEntryId: entry.id };
  });
}
