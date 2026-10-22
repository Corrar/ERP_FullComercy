// src/core/dashboard/dashboard.routes.ts — GET /dashboard: a primeira tela de QUALQUER empresa.
// KPIs do core e de cada módulo ativo, números do dia, numa chamada só.
//
// Cada número diz a chave que precisa para ser visto e passa pelo MESMO `canUse` das rotas: a
// permissão da pessoa já cortada pelo plano. Quem não pode ver não recebe o campo (nem a consulta
// roda): o Caixa não vê o "a receber" do financeiro, e a empresa que não contratou Comissões não vê
// "comissões pendentes". A rota em si fica aberta a todo usuário logado — é a tela de entrada.
import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { ctx } from '../tenancy/tenant-context';
import { D } from '../../shared/money';
import { canUse, effectivePermissions } from '../rbac/rbac.service';
import { KEYS_REQUIRED_BY_ROUTES } from '../rbac/rbac.middleware';
import type { AuthRequest } from '../auth/auth.middleware';

type Kpi = [chave: Chave, consulta: () => Promise<unknown>];

/** Chaves que o painel cobra. Entram na mesma conferência de boot das rotas
 *  (`assertAllRequiredKeysAreDeclared`): chave digitada errada derruba o boot em vez de esconder o
 *  número de todo mundo em silêncio. */
const CHAVES = ['core.orders:view', 'core.finance:view', 'core.stock:view', 'varejo.pdv:operate', 'varejo.comissoes:view',
  'food.salao:operate', 'food.cozinha:view', 'food.delivery:operate', 'gym.matriculas:view', 'gym.acesso:operate', 'svc.os:view',
  'svc.agenda:operate', 'bel.agenda:operate', 'pet.banho:operate', 'pet.vet:view', 'cli.agenda:operate', 'cli.convenios:manage',
  'hot.reservas:operate', 'hot.governanca:operate'] as const;
for (const k of CHAVES) KEYS_REQUIRED_BY_ROUTES.add(k);
type Chave = (typeof CHAVES)[number];

const router = Router();
router.get('/', asyncHandler(async (req, res) => {
  const { db, modules, tenantId } = ctx();
  const acc = await effectivePermissions(tenantId, (req as AuthRequest).auth!.userId);
  const pode = (k: Chave) => canUse(acc, k);
  /** Roda só as consultas que a pessoa pode ver; o resto nem vira campo. */
  const bloco = async (kpis: Record<string, Kpi>) => {
    const out: Record<string, unknown> = {};
    for (const [nome, [chave, q]] of Object.entries(kpis)) if (pode(chave)) out[nome] = await q();
    return out;
  };

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje.getTime() + 86_400_000);
  const diaUtc = new Date(new Date().toISOString().slice(0, 10)); // colunas @db.Date gravam meia-noite UTC
  const out: Record<string, unknown> = {};

  if (pode('core.orders:view')) {
    const vendas = await db.order.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: hoje } }, _count: true, _sum: { total: true } });
    out.hoje = { vendas: vendas._count, faturamento: vendas._sum.total ?? 0 };
    out.pedidosAbertos = await db.order.count({ where: { status: { in: ['OPEN', 'CONFIRMED', 'IN_PROGRESS', 'READY'] } } });
  }
  if (pode('core.finance:view')) {
    const receber = await db.financeEntry.aggregate({ where: { kind: 'RECEIVABLE', status: { in: ['OPEN', 'PARTIAL'] } }, _sum: { amount: true, paidAmount: true } });
    out.financeiro = { aReceber: D(receber._sum.amount ?? 0).minus(receber._sum.paidAmount ?? 0), titulosVencidos: await db.financeEntry.count({ where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: hoje } } }) };
  }
  if (pode('core.stock:view')) {
    const baixo = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM core_stock_balances WHERE tenant_id = ${tenantId}::uuid AND min_level IS NOT NULL AND on_hand <= min_level`;
    out.estoque = { itensAbaixoDoMinimo: baixo[0]?.n ?? 0 };
  }

  const porModulo: Record<string, Record<string, Kpi>> = {
    VAREJO: {
      caixasAbertos: ['varejo.pdv:operate', () => db.retailPosSession.count({ where: { status: 'OPEN' } })],
      comissoesPendentes: ['varejo.comissoes:view', () => db.retailCommission.count({ where: { status: 'PENDING' } })],
    },
    FOOD: {
      mesasOcupadas: ['food.salao:operate', () => db.foodTable.count({ where: { status: 'OCCUPIED' } })],
      comandasAbertas: ['food.salao:operate', () => db.foodTab.count({ where: { status: 'OPEN' } })],
      naCozinha: ['food.cozinha:view', () => db.foodKitchenTicket.count({ where: { status: { in: ['QUEUED', 'PREPARING'] } } })],
      entregasEmCurso: ['food.delivery:operate', () => db.foodDelivery.count({ where: { status: { in: ['PENDING', 'ASSIGNED', 'PICKED_UP'] } } })],
    },
    ACADEMIA: {
      alunosAtivos: ['gym.matriculas:view', () => db.gymMembership.count({ where: { status: 'ACTIVE' } })],
      inadimplentes: ['gym.matriculas:view', () => db.gymMembership.count({ where: { status: 'OVERDUE' } })],
      checkinsHoje: ['gym.acesso:operate', () => db.gymCheckIn.count({ where: { checkedInAt: { gte: hoje } } })],
    },
    SERVICOS: {
      osNoPatio: ['svc.os:view', () => db.svcServiceOrder.count({ where: { maintenanceStatus: { notIn: ['DELIVERED', 'CANCELLED'] } } })],
      aguardandoAprovacao: ['svc.os:view', () => db.svcServiceOrder.count({ where: { maintenanceStatus: 'AWAITING_APPROVAL' } })],
      prontos: ['svc.os:view', () => db.svcServiceOrder.count({ where: { maintenanceStatus: 'READY' } })],
      agendadosHoje: ['svc.agenda:operate', () => db.svcAppointment.count({ where: { scheduledAt: { gte: hoje, lt: amanha }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } })],
    },
    BELEZA: {
      agendadosHoje: ['bel.agenda:operate', () => db.belAppointment.count({ where: { startsAt: { gte: hoje, lt: amanha }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } })],
      emAtendimento: ['bel.agenda:operate', () => db.belAppointment.count({ where: { status: 'IN_SERVICE' } })],
      faltasHoje: ['bel.agenda:operate', () => db.belAppointment.count({ where: { startsAt: { gte: hoje, lt: amanha }, status: 'NO_SHOW' } })],
    },
    PET: {
      banhosHoje: ['pet.banho:operate', () => db.petGrooming.count({ where: { scheduledAt: { gte: hoje, lt: amanha }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } })],
      prontosParaBuscar: ['pet.banho:operate', () => db.petGrooming.count({ where: { status: 'READY' } })],
      vacinasVencidas: ['pet.vet:view', () => db.petVaccine.count({ where: { nextDueAt: { lt: hoje } } })],
    },
    CLINICA: {
      consultasHoje: ['cli.agenda:operate', () => db.cliAppointment.count({ where: { startsAt: { gte: hoje, lt: amanha }, status: { notIn: ['CANCELLED'] } } })],
      naRecepcao: ['cli.agenda:operate', () => db.cliAppointment.count({ where: { status: 'ARRIVED' } })],
      convenioAReceber: ['cli.convenios:manage', () => db.cliCharge.count({ where: { payer: 'CONVENIO', order: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } } })],
    },
    HOTEL: {
      quartosOcupados: ['hot.reservas:operate', () => db.hotRoom.count({ where: { status: 'OCCUPIED' } })],
      chegadasHoje: ['hot.reservas:operate', () => db.hotReservation.count({ where: { checkIn: diaUtc, status: 'BOOKED' } })],
      saidasHoje: ['hot.reservas:operate', () => db.hotReservation.count({ where: { checkOut: diaUtc, status: 'CHECKED_IN' } })],
      emLimpeza: ['hot.governanca:operate', () => db.hotRoom.count({ where: { status: 'CLEANING' } })],
    },
  };
  const m: Record<string, unknown> = {};
  for (const [mod, kpis] of Object.entries(porModulo)) {
    if (!modules.has(mod as never)) continue;
    const b = await bloco(kpis);
    if (Object.keys(b).length) m[mod] = b;
  }
  out.modulos = m;
  res.json(out);
}));
export default router;
