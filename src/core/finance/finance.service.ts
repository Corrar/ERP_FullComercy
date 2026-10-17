// src/core/finance/finance.service.ts — títulos a receber/pagar e baixas.
// Os módulos NÃO criam `FinanceEntry` por conta própria: chamam `createEntry`/`settle` daqui.
// Assim "quanto entrou hoje" é UMA query no core, somando PDV, delivery, mensalidade e OS.
import { FinanceEntryKind, FinanceEntryStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { TenantTx } from '../../infra/prisma';
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
    include: { customer: { select: { name: true } }, payments: true },
    orderBy: { dueDate: 'asc' }, take: 500,
  });
}
