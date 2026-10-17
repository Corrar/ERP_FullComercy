// modules/varejo/services/pdv.service.ts — abertura/fechamento de caixa.
import { Prisma } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';

export async function abrirCaixa(terminal: string, openingAmount: number) {
  const { db, userId, tenantId } = ctx();
  const aberto = await db.retailPosSession.findFirst({ where: { terminal, status: 'OPEN' } });
  if (aberto) throw AppError.conflict(`Terminal ${terminal} já tem caixa aberto.`);
  return db.retailPosSession.create({ data: { tenantId, terminal, openingAmount: D(openingAmount), openedByUserId: userId! } });
}

export async function fecharCaixa(sessionId: string, closingAmount: number, notes?: string) {
  const { db, userId } = ctx();
  const s = await db.retailPosSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== 'OPEN') throw AppError.conflict('Caixa não está aberto.');
  // Esperado = fundo de troco + dinheiro recebido nas vendas COMPLETED desta sessão.
  const dinheiro = await db.orderPayment.aggregate({
    where: { method: 'CASH', order: { status: 'COMPLETED', retailSale: { posSessionId: sessionId } } },
    _sum: { amount: true },
  });
  const mov = await db.financeEntry.findMany({ where: { origin: 'POS_CASH', originId: sessionId }, select: { kind: true, amount: true } });
  const suprimentos = mov.filter((m) => m.kind === 'RECEIVABLE').reduce((a, m) => a.plus(m.amount), D(0));
  const sangrias = mov.filter((m) => m.kind === 'PAYABLE').reduce((a, m) => a.plus(m.amount), D(0));
  const expected = round2(D(s.openingAmount).plus(D(dinheiro._sum.amount ?? 0)).plus(suprimentos).minus(sangrias));
  return db.retailPosSession.update({
    where: { id: sessionId },
    data: { status: 'CLOSED', closedAt: new Date(), closedByUserId: userId, expectedAmount: expected, closingAmount: round2(D(closingAmount)), notes },
  });
}

export async function resumoCaixa(sessionId: string) {
  const { db } = ctx();
  const s = await db.retailPosSession.findUnique({ where: { id: sessionId } });
  if (!s) throw AppError.notFound('Caixa');
  const porMetodo = await db.orderPayment.groupBy({
    by: ['method'], where: { order: { status: 'COMPLETED', retailSale: { posSessionId: sessionId } } }, _sum: { amount: true }, _count: true,
  });
  return { sessao: s, porMetodo: porMetodo.map((p) => ({ method: p.method, total: p._sum.amount ?? new Prisma.Decimal(0), qtd: p._count })) };
}

export const listarSessoes = (filter: { status?: 'OPEN' | 'CLOSED'; terminal?: string }) =>
  ctx().db.retailPosSession.findMany({ where: filter, include: { openedBy: { select: { name: true } }, closedBy: { select: { name: true } }, _count: { select: { sales: true } } }, orderBy: { openedAt: 'desc' }, take: 100 });

export const sessaoAbertaDoTerminal = (terminal: string) => ctx().db.retailPosSession.findFirst({ where: { terminal, status: 'OPEN' } });

/** Sangria (retira dinheiro do caixa) / suprimento (põe). Fica no financeiro, com a sessão como origem. */
export async function movimentoDeCaixa(sessionId: string, kind: 'SANGRIA' | 'SUPRIMENTO', amount: number, note?: string) {
  const { db, tenantId } = ctx();
  const s = await db.retailPosSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== 'OPEN') throw AppError.conflict('Caixa não está aberto.');
  const { tenantTransaction } = await import('../../../infra/prisma');
  const finance = await import('../../../core/finance/finance.service');
  return tenantTransaction(db, tenantId, async (tx) => {
    const entry = await finance.createEntry(tx, tenantId, {
      kind: kind === 'SANGRIA' ? 'PAYABLE' : 'RECEIVABLE', description: `${kind} caixa ${s.terminal}${note ? ` · ${note}` : ''}`,
      amount: D(amount), dueDate: new Date(), origin: 'POS_CASH', originId: sessionId,
    });
    return finance.settle(tx, tenantId, { entryId: entry.id, amount: D(amount), method: 'CASH' });
  });
}
