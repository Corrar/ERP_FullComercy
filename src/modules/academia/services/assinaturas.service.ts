// modules/academia/services/assinaturas.service.ts — a recorrência.
// `criarMatricula` arma `nextBillingAt`; `gerarCobrancasVencidas` é o JOB diário que, para cada
// matrícula com `nextBillingAt <= hoje`, cria a cobrança do período → `FinanceEntry` do core.
import { BillingCycle, FinanceEntryKind, MembershipStatus } from '@prisma/client';
import type { TenantTx } from '../../../infra/prisma';
import { prisma, prismaForTenant, tenantTransaction } from '../../../infra/prisma';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import * as finance from '../../../core/finance/finance.service';

/** Soma um ciclo preservando o "dia do mês" sem estourar: 31/jan + 1 mês = 28/fev (ou 29),
 *  não 3/mar. `setMonth` cru estoura, e uma matrícula aberta no dia 31 derivaria a cada ciclo
 *  (achado por teste: 31/jan + 3 meses dava 1º/mai). */
export function somarCiclo(d: Date, ciclo: BillingCycle): Date {
  const r = new Date(d);
  if (ciclo === 'WEEKLY') { r.setDate(r.getDate() + 7); return r; }
  const meses: Record<BillingCycle, number> = { WEEKLY: 0, MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 };
  const dia = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + meses[ciclo]);
  const ultimoDia = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dia, ultimoDia));
  return r;
}

export async function criarMatricula(tx: TenantTx, input: { customerId: string; planId: string; orderId?: string; startDate: Date; autoRenew: boolean; primeiraCobrancaPaga: boolean }) {
  const { tenantId } = ctx();
  const plan = await tx.gymPlan.findUnique({ where: { id: input.planId } });
  if (!plan) throw AppError.notFound('Plano');
  const fimPeriodo = somarCiclo(input.startDate, plan.billingCycle);
  const endDate = plan.contractCycles ? Array.from({ length: plan.contractCycles }).reduce<Date>((d) => somarCiclo(d, plan.billingCycle), input.startDate) : null;

  const m = await tx.gymMembership.create({
    data: { tenantId, customerId: input.customerId, planId: plan.id, orderId: input.orderId ?? null, startDate: input.startDate, endDate, nextBillingAt: fimPeriodo, autoRenew: input.autoRenew },
  });
  if (!input.primeiraCobrancaPaga) {
    await gerarCobranca(tx, tenantId, m.id, input.startDate, fimPeriodo, D(plan.price), input.customerId);
  }
  return m;
}

async function gerarCobranca(tx: TenantTx, tenantId: string, membershipId: string, inicio: Date, fim: Date, valor: ReturnType<typeof D>, customerId: string) {
  const entry = await finance.createEntry(tx, tenantId, {
    kind: FinanceEntryKind.RECEIVABLE, description: `Mensalidade ${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`,
    amount: valor, dueDate: inicio, customerId, origin: 'GYM_MEMBERSHIP', originId: membershipId,
  });
  return tx.gymMembershipCharge.create({ data: { tenantId, membershipId, financeEntryId: entry.id, periodStart: inicio, periodEnd: fim, amount: valor } });
}

/** JOB (plataforma, todos os tenants): gera a próxima cobrança e marca inadimplência. */
export async function gerarCobrancasVencidas(hoje = new Date()) {
  const tenants = await prisma.tenantModule.findMany({ where: { moduleKey: 'ACADEMIA', enabled: true }, select: { tenantId: true } });
  let geradas = 0;
  for (const { tenantId } of tenants) {
    const db = prismaForTenant(tenantId);
    const vencidas = await db.gymMembership.findMany({ where: { status: { in: ['ACTIVE', 'OVERDUE'] }, autoRenew: true, nextBillingAt: { lte: hoje }, OR: [{ endDate: null }, { endDate: { gte: hoje } }] }, include: { plan: true } });
    for (const m of vencidas) {
      await tenantTransaction(db, tenantId, async (tx) => {
        const fim = somarCiclo(m.nextBillingAt!, m.plan.billingCycle);
        await gerarCobranca(tx, tenantId, m.id, m.nextBillingAt!, fim, D(m.plan.price), m.customerId);
        await tx.gymMembership.update({ where: { id: m.id }, data: { nextBillingAt: fim } });
      });
      geradas++;
    }
    // Inadimplente: alguma cobrança em aberto vencida há mais de N dias (config do módulo; default 5).
    const limite = new Date(hoje); limite.setDate(limite.getDate() - 5);
    await db.gymMembership.updateMany({ where: { status: 'ACTIVE', charges: { some: { financeEntry: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: limite } } } } }, data: { status: MembershipStatus.OVERDUE } });
    await db.gymMembership.updateMany({ where: { status: 'OVERDUE', charges: { none: { financeEntry: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: limite } } } } }, data: { status: MembershipStatus.ACTIVE } });
  }
  return { tenants: tenants.length, cobrancasGeradas: geradas };
}

export async function cancelarMatricula(id: string, reason: string) {
  const m = await ctx().db.gymMembership.findUnique({ where: { id } });
  if (!m) throw AppError.notFound('Matrícula');
  return ctx().db.gymMembership.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, autoRenew: false } });
}

export async function listarMatriculas(filter: { status?: MembershipStatus; customerId?: string }) {
  return ctx().db.gymMembership.findMany({ where: filter, include: { customer: { select: { name: true, phone: true } }, plan: { select: { name: true, price: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
}

export async function pausarMatricula(id: string, ate: Date) {
  const m = await ctx().db.gymMembership.findUnique({ where: { id } });
  if (!m || m.status !== 'ACTIVE') throw AppError.conflict('Só matrícula ativa pode ser pausada.');
  // Pausa empurra a próxima cobrança pelo tempo pausado.
  const dias = Math.ceil((ate.getTime() - Date.now()) / 86_400_000);
  const next = m.nextBillingAt ? new Date(m.nextBillingAt.getTime() + dias * 86_400_000) : null;
  return ctx().db.gymMembership.update({ where: { id }, data: { status: 'PAUSED', pausedUntil: ate, nextBillingAt: next } });
}
export async function retomarMatricula(id: string) {
  const m = await ctx().db.gymMembership.findUnique({ where: { id } });
  if (!m || m.status !== 'PAUSED') throw AppError.conflict('Matrícula não está pausada.');
  return ctx().db.gymMembership.update({ where: { id }, data: { status: 'ACTIVE', pausedUntil: null } });
}

/** Troca de plano: encerra a atual (sem fidelidade pendente) e abre a nova a partir de hoje. */
export async function trocarPlano(id: string, novoPlanId: string) {
  const { db, tenantId } = ctx();
  return tenantTransaction(db, tenantId, async (tx) => {
    const m = await tx.gymMembership.findUnique({ where: { id } });
    if (!m || !['ACTIVE', 'OVERDUE'].includes(m.status)) throw AppError.conflict('Matrícula não permite troca.');
    await tx.gymMembership.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: `Troca de plano → ${novoPlanId}`, autoRenew: false } });
    return criarMatricula(tx, { customerId: m.customerId, planId: novoPlanId, startDate: new Date(), autoRenew: m.autoRenew, primeiraCobrancaPaga: false });
  });
}

export const cobrancasDaMatricula = (id: string) => ctx().db.gymMembershipCharge.findMany({ where: { membershipId: id }, include: { financeEntry: true }, orderBy: { periodStart: 'desc' } });

export const inadimplentes = () => ctx().db.gymMembership.findMany({
  where: { status: 'OVERDUE' },
  include: { customer: { select: { name: true, phone: true, email: true } }, plan: { select: { name: true } }, charges: { where: { financeEntry: { status: { in: ['OPEN', 'PARTIAL'] } } }, include: { financeEntry: { select: { amount: true, paidAmount: true, dueDate: true } } } } },
  orderBy: { updatedAt: 'asc' },
});

/** Vencem nos próximos N dias (para a régua de cobrança). */
export const aVencer = (dias = 7) => {
  const ate = new Date(); ate.setDate(ate.getDate() + dias);
  return ctx().db.gymMembership.findMany({ where: { status: 'ACTIVE', nextBillingAt: { lte: ate } }, include: { customer: { select: { name: true, phone: true } }, plan: { select: { name: true, price: true } } }, orderBy: { nextBillingAt: 'asc' } });
};
