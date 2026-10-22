// src/core/finance/finance.service.ts — títulos a receber/pagar e baixas.
// Os módulos NÃO criam `FinanceEntry` por conta própria: chamam `createEntry`/`settle` daqui.
// Assim "quanto entrou hoje" é UMA query no core, somando PDV, delivery, mensalidade e OS.
import { FinanceEntryKind, FinanceEntryStatus, PaymentMethod, Prisma } from '@prisma/client';
import { tenantTransaction, type TenantTx } from '../../infra/prisma';
import { ctx } from '../tenancy/tenant-context';
import { AppError } from '../../shared/errors';
import { D, round2 } from '../../shared/money';

export interface CreateEntryInput {
  kind: FinanceEntryKind;
  description: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  customerId?: string | null;
  orderId?: string | null;
  categoryId?: string | null;
  origin: string;            // 'ORDER' | 'GYM_MEMBERSHIP' | 'MANUAL' | …
  originId?: string | null;
}

export async function createEntry(tx: TenantTx, tenantId: string, input: CreateEntryInput) {
  if (input.amount.lte(0)) throw AppError.validation('Valor do título deve ser positivo.');
  return tx.financeEntry.create({ data: { ...input, tenantId, amount: round2(input.amount) } });
}

export interface SettleInput {
  entryId: string;
  amount: Prisma.Decimal;
  method: PaymentMethod;
  accountId?: string | null;
  reference?: string | null;
  paidAt?: Date;
}

/** Baixa (total ou parcial). Recalcula status a partir do que já foi pago. */
export async function settle(tx: TenantTx, tenantId: string, input: SettleInput) {
  const entry = await tx.financeEntry.findUnique({ where: { id: input.entryId } });
  if (!entry) throw AppError.notFound('Título');
  if (entry.status === FinanceEntryStatus.CANCELLED) throw AppError.conflict('Título cancelado.');
  const accountId = input.accountId ?? (await defaultAccountId(tx));
  const paid = round2(D(entry.paidAmount).plus(input.amount));
  if (paid.gt(entry.amount)) throw AppError.validation('Pagamento excede o valor do título.');

  await tx.financePayment.create({
    data: { tenantId, entryId: entry.id, accountId, method: input.method, amount: round2(input.amount), reference: input.reference ?? null, paidAt: input.paidAt ?? new Date() },
  });
  return tx.financeEntry.update({
    where: { id: entry.id },
    data: {
      paidAmount: paid,
      status: paid.eq(entry.amount) ? FinanceEntryStatus.PAID : FinanceEntryStatus.PARTIAL,
      paidAt: paid.eq(entry.amount) ? (input.paidAt ?? new Date()) : null,
    },
  });
}

async function defaultAccountId(tx: TenantTx): Promise<string> {
  const a = await tx.financeAccount.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
  if (!a) throw new AppError('INTERNAL', 'Empresa sem conta financeira padrão. Rode o onboarding.');
  return a.id;
}

export async function listEntries(filter: { kind?: FinanceEntryKind; status?: FinanceEntryStatus; from?: Date; to?: Date }) {
  return ctx().db.financeEntry.findMany({
    where: { kind: filter.kind, status: filter.status, dueDate: { gte: filter.from, lte: filter.to } },
    include: { customer: { select: { name: true } }, category: { select: { name: true } }, payments: true },
    orderBy: { dueDate: 'asc' }, take: 500,
  });
}

// ── Contas e categorias ──
export const listAccounts = () => ctx().db.financeAccount.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
export async function createAccount(input: { name: string; kind: 'CASH' | 'BANK' | 'DIGITAL'; isDefault?: boolean }) {
  const { db, tenantId } = ctx();
  if (input.isDefault) await db.financeAccount.updateMany({ where: {}, data: { isDefault: false } });
  return db.financeAccount.create({ data: { ...input, tenantId } });
}
export const listCategories = () => ctx().db.financeCategory.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
export const createCategory = (input: { name: string; kind: FinanceEntryKind }) => ctx().db.financeCategory.create({ data: { ...input, tenantId: ctx().tenantId } });

// Mexer em título à mão (baixa, edição, cancelamento) deixa rastro na auditoria: é dinheiro.
const auditar = (tx: TenantTx, action: string, entityId: string, details: Record<string, unknown>) =>
  tx.auditLog.create({ data: { tenantId: ctx().tenantId, userId: ctx().userId, action, entity: 'FinanceEntry', entityId, details: details as Prisma.InputJsonValue } });

/** Baixa manual (tela do financeiro). As baixas de venda/compra entram por `settle` direto. */
export async function baixaManual(input: SettleInput) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const row = await settle(tx, tenantId, input);
    await auditar(tx, 'finance.entry.settle', input.entryId, { amount: input.amount.toString(), method: input.method, accountId: input.accountId, reference: input.reference });
    return row;
  });
}

export async function cancelEntry(id: string, reason: string) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const e = await tx.financeEntry.findUnique({ where: { id } });
    if (!e) throw AppError.notFound('Título');
    if (e.status === FinanceEntryStatus.CANCELLED) throw AppError.conflict('Título já cancelado.');
    if (D(e.paidAmount).gt(0)) throw AppError.conflict('Título com baixa não pode ser cancelado; estorne os pagamentos.');
    const row = await tx.financeEntry.update({ where: { id }, data: { status: FinanceEntryStatus.CANCELLED, notes: [e.notes, `Cancelado: ${reason}`].filter(Boolean).join('\n') } });
    await auditar(tx, 'finance.entry.cancel', id, { reason, amount: e.amount.toString(), description: e.description });
    return row;
  });
}

/** Edição do título. O valor não desce abaixo do já baixado e o status acompanha o novo valor
 *  (antes ficava PARTIAL com o pago maior que o total, ou OPEN com tudo quitado). */
export async function updateEntry(id: string, input: { description?: string; dueDate?: Date; categoryId?: string | null; notes?: string; amount?: number }) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const e = await tx.financeEntry.findUnique({ where: { id } });
    if (!e) throw AppError.notFound('Título');
    if (e.status === FinanceEntryStatus.CANCELLED) throw AppError.conflict('Título cancelado não se edita.');
    let status: FinanceEntryStatus | undefined; let amount: Prisma.Decimal | undefined;
    if (input.amount !== undefined) {
      amount = round2(D(input.amount)); const pago = D(e.paidAmount);
      if (amount.lt(pago)) throw AppError.validation(`O valor não pode ficar abaixo do já baixado (${pago.toFixed(2)}).`);
      status = amount.eq(pago) ? FinanceEntryStatus.PAID : pago.gt(0) ? FinanceEntryStatus.PARTIAL : FinanceEntryStatus.OPEN;
    }
    const row = await tx.financeEntry.update({ where: { id }, data: { ...input, amount, status } });
    await auditar(tx, 'finance.entry.update', id, { antes: { description: e.description, amount: e.amount.toString(), dueDate: e.dueDate, categoryId: e.categoryId }, depois: input });
    return row;
  });
}

/** Fluxo de caixa do período: recebido × pago por dia, por conta e por categoria; vencidos. */
export async function summary(from: Date, to: Date) {
  const { db, tenantId } = ctx();
  const porDia = await db.$queryRaw<{ dia: Date; kind: string; total: string }[]>`
    SELECT date_trunc('day', p.paid_at) AS dia, e.kind, SUM(p.amount)::text AS total
      FROM core_finance_payments p JOIN core_finance_entries e ON e.id = p.entry_id
     WHERE p.tenant_id = ${tenantId}::uuid AND p.paid_at BETWEEN ${from} AND ${to}
     GROUP BY 1, 2 ORDER BY 1`;
  const [porConta, porCategoria, vencidos, aVencer] = await Promise.all([
    db.financePayment.groupBy({ by: ['accountId', 'method'], where: { paidAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    db.financeEntry.groupBy({ by: ['kind', 'categoryId'], where: { paidAt: { gte: from, lte: to }, status: 'PAID' }, _sum: { amount: true }, _count: true }),
    db.financeEntry.findMany({ where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: new Date() } }, include: { customer: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 100 }),
    db.financeEntry.aggregate({ where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { gte: new Date() } }, _sum: { amount: true, paidAmount: true }, _count: true }),
  ]);
  const totais = porDia.reduce((acc, r) => { acc[r.kind === 'RECEIVABLE' ? 'recebido' : 'pago'] = acc[r.kind === 'RECEIVABLE' ? 'recebido' : 'pago'].plus(D(r.total)); return acc; }, { recebido: D(0), pago: D(0) });
  return { periodo: { from, to }, recebido: totais.recebido, pago: totais.pago, saldo: totais.recebido.minus(totais.pago), porDia, porConta, porCategoria, vencidos, aVencer };
}
