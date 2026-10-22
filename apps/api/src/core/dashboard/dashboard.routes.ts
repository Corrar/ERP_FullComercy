// src/core/dashboard/dashboard.routes.ts — GET /dashboard: a primeira tela de QUALQUER empresa.
// KPIs do core sempre; cada módulo ativo acrescenta os seus. Uma chamada, números do dia.
import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { ctx } from '../tenancy/tenant-context';
import { D } from '../../shared/money';

const router = Router();
router.get('/', asyncHandler(async (_req, res) => {
  const { db, modules } = ctx();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const [vendas, receber, vencidos, baixo, abertos] = await Promise.all([
    db.order.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: hoje } }, _count: true, _sum: { total: true } }),
    db.financeEntry.aggregate({ where: { kind: 'RECEIVABLE', status: { in: ['OPEN', 'PARTIAL'] } }, _sum: { amount: true, paidAmount: true } }),
    db.financeEntry.count({ where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: hoje } } }),
    db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM core_stock_balances WHERE tenant_id = ${ctx().tenantId}::uuid AND min_level IS NOT NULL AND on_hand <= min_level`,
    db.order.count({ where: { status: { in: ['OPEN', 'CONFIRMED', 'IN_PROGRESS', 'READY'] } } }),
  ]);
  const out: Record<string, unknown> = {
    hoje: { vendas: vendas._count, faturamento: vendas._sum.total ?? 0 },
    financeiro: { aReceber: D(receber._sum.amount ?? 0).minus(receber._sum.paidAmount ?? 0), titulosVencidos: vencidos },
    estoque: { itensAbaixoDoMinimo: baixo[0]?.n ?? 0 },
    pedidosAbertos: abertos,
    modulos: {} as Record<string, unknown>,
  };
  const m = out.modulos as Record<string, unknown>;
  if (modules.has('VAREJO')) m.VAREJO = { caixasAbertos: await db.retailPosSession.count({ where: { status: 'OPEN' } }), comissoesPendentes: await db.retailCommission.count({ where: { status: 'PENDING' } }) };
  if (modules.has('FOOD')) m.FOOD = { mesasOcupadas: await db.foodTable.count({ where: { status: 'OCCUPIED' } }), comandasAbertas: await db.foodTab.count({ where: { status: 'OPEN' } }), naCozinha: await db.foodKitchenTicket.count({ where: { status: { in: ['QUEUED', 'PREPARING'] } } }), entregasEmCurso: await db.foodDelivery.count({ where: { status: { in: ['PENDING', 'ASSIGNED', 'PICKED_UP'] } } }) };
  if (modules.has('ACADEMIA')) m.ACADEMIA = { alunosAtivos: await db.gymMembership.count({ where: { status: 'ACTIVE' } }), inadimplentes: await db.gymMembership.count({ where: { status: 'OVERDUE' } }), checkinsHoje: await db.gymCheckIn.count({ where: { checkedInAt: { gte: hoje } } }) };
  if (modules.has('SERVICOS')) m.SERVICOS = { osNoPatio: await db.svcServiceOrder.count({ where: { maintenanceStatus: { notIn: ['DELIVERED', 'CANCELLED'] } } }), aguardandoAprovacao: await db.svcServiceOrder.count({ where: { maintenanceStatus: 'AWAITING_APPROVAL' } }), prontos: await db.svcServiceOrder.count({ where: { maintenanceStatus: 'READY' } }), agendadosHoje: await db.svcAppointment.count({ where: { scheduledAt: { gte: hoje, lt: new Date(hoje.getTime() + 86_400_000) }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }) };
  const amanha = new Date(hoje.getTime() + 86_400_000);
  const diaUtc = new Date(new Date().toISOString().slice(0, 10)); // colunas @db.Date gravam meia-noite UTC
  if (modules.has('BELEZA')) m.BELEZA = { agendadosHoje: await db.belAppointment.count({ where: { startsAt: { gte: hoje, lt: amanha }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }), emAtendimento: await db.belAppointment.count({ where: { status: 'IN_SERVICE' } }), faltasHoje: await db.belAppointment.count({ where: { startsAt: { gte: hoje, lt: amanha }, status: 'NO_SHOW' } }) };
  if (modules.has('PET')) m.PET = { banhosHoje: await db.petGrooming.count({ where: { scheduledAt: { gte: hoje, lt: amanha }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } }), prontosParaBuscar: await db.petGrooming.count({ where: { status: 'READY' } }), vacinasVencidas: await db.petVaccine.count({ where: { nextDueAt: { lt: hoje } } }) };
  if (modules.has('CLINICA')) m.CLINICA = { consultasHoje: await db.cliAppointment.count({ where: { startsAt: { gte: hoje, lt: amanha }, status: { notIn: ['CANCELLED'] } } }), naRecepcao: await db.cliAppointment.count({ where: { status: 'ARRIVED' } }), convenioAReceber: await db.cliCharge.count({ where: { payer: 'CONVENIO', order: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } } }) };
  if (modules.has('HOTEL')) m.HOTEL = { quartosOcupados: await db.hotRoom.count({ where: { status: 'OCCUPIED' } }), chegadasHoje: await db.hotReservation.count({ where: { checkIn: diaUtc, status: 'BOOKED' } }), saidasHoje: await db.hotReservation.count({ where: { checkOut: diaUtc, status: 'CHECKED_IN' } }), emLimpeza: await db.hotRoom.count({ where: { status: 'CLEANING' } }) };
  res.json(out);
}));
export default router;
