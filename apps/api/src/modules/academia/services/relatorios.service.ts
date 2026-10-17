// modules/academia/services/relatorios.service.ts — os números da academia.
import { ctx } from '../../../core/tenancy/tenant-context';

export const frequenciaPorDia = (from: Date, to: Date) => ctx().db.$queryRaw<{ dia: Date; checkins: number; alunos: number }[]>`
  SELECT date_trunc('day', checked_in_at) AS dia, COUNT(*)::int AS checkins, COUNT(DISTINCT customer_id)::int AS alunos
    FROM gym_check_ins WHERE tenant_id = ${ctx().tenantId}::uuid AND checked_in_at BETWEEN ${from} AND ${to}
   GROUP BY 1 ORDER BY 1`;

export const horariosDePico = (from: Date, to: Date) => ctx().db.$queryRaw<{ dow: number; hora: number; checkins: number }[]>`
  SELECT EXTRACT(DOW FROM checked_in_at)::int AS dow, EXTRACT(HOUR FROM checked_in_at)::int AS hora, COUNT(*)::int AS checkins
    FROM gym_check_ins WHERE tenant_id = ${ctx().tenantId}::uuid AND checked_in_at BETWEEN ${from} AND ${to}
   GROUP BY 1, 2 ORDER BY 1, 2`;

/** Alunos ativos que não aparecem há N dias: a lista de retenção. */
export const sumidos = (dias = 14) => ctx().db.$queryRaw<{ customer_id: string; nome: string; telefone: string | null; plano: string; ultimo_checkin: Date | null }[]>`
  SELECT m.customer_id, c.name AS nome, c.phone AS telefone, p.name AS plano,
         (SELECT MAX(checked_in_at) FROM gym_check_ins ci WHERE ci.customer_id = m.customer_id) AS ultimo_checkin
    FROM gym_memberships m JOIN core_customers c ON c.id = m.customer_id JOIN gym_plans p ON p.id = m.plan_id
   WHERE m.tenant_id = ${ctx().tenantId}::uuid AND m.status = 'ACTIVE'
     AND COALESCE((SELECT MAX(checked_in_at) FROM gym_check_ins ci WHERE ci.customer_id = m.customer_id), m.start_date) < now() - make_interval(days => ${dias})
   ORDER BY ultimo_checkin NULLS FIRST`;

/** MRR (receita recorrente mensal normalizada), ativos, churn do mês. */
export async function painel() {
  const { db, tenantId } = ctx();
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [ativos, mrr, novos, cancelados, inadimplentes, presentesHoje] = await Promise.all([
    db.gymMembership.count({ where: { status: { in: ['ACTIVE', 'PAUSED'] } } }),
    db.$queryRaw<{ mrr: string }[]>`
      SELECT COALESCE(SUM(CASE p.billing_cycle WHEN 'WEEKLY' THEN p.price * 4.33 WHEN 'MONTHLY' THEN p.price WHEN 'QUARTERLY' THEN p.price / 3 WHEN 'SEMIANNUAL' THEN p.price / 6 WHEN 'ANNUAL' THEN p.price / 12 END), 0)::text AS mrr
        FROM gym_memberships m JOIN gym_plans p ON p.id = m.plan_id WHERE m.tenant_id = ${tenantId}::uuid AND m.status = 'ACTIVE'`,
    db.gymMembership.count({ where: { createdAt: { gte: inicioMes } } }),
    db.gymMembership.count({ where: { cancelledAt: { gte: inicioMes } } }),
    db.gymMembership.count({ where: { status: 'OVERDUE' } }),
    db.gymCheckIn.count({ where: { checkedInAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);
  const base = ativos + cancelados;
  return { ativos, mrr: mrr[0]?.mrr ?? '0', novosNoMes: novos, canceladosNoMes: cancelados, churnMes: base ? cancelados / base : 0, inadimplentes, checkinsHoje: presentesHoje };
}
