// modules/food/services/relatorios.service.ts — relatórios do restaurante.
import { ctx } from '../../../core/tenancy/tenant-context';

export const vendasPorItem = (from: Date, to: Date) => ctx().db.$queryRaw<{ item: string; qtd: string; total: string }[]>`
  SELECT i.description AS item, SUM(i.quantity)::text AS qtd, SUM(i.total)::text AS total
    FROM core_order_items i JOIN core_orders o ON o.id = i.order_id
   WHERE i.tenant_id = ${ctx().tenantId}::uuid AND o.module_key = 'FOOD' AND o.status = 'COMPLETED' AND o.completed_at BETWEEN ${from} AND ${to} AND i.kind = 'PRODUCT'
   GROUP BY 1 ORDER BY SUM(i.total) DESC LIMIT 50`;

export const porTipoDeServico = (from: Date, to: Date) => ctx().db.$queryRaw<{ tipo: string; pedidos: number; total: string; ticket_medio: string }[]>`
  SELECT f.service_type AS tipo, COUNT(*)::int AS pedidos, SUM(o.total)::text AS total, AVG(o.total)::text AS ticket_medio
    FROM food_orders f JOIN core_orders o ON o.id = f.order_id
   WHERE f.tenant_id = ${ctx().tenantId}::uuid AND o.status = 'COMPLETED' AND o.completed_at BETWEEN ${from} AND ${to}
   GROUP BY 1`;

export const movimentoPorHora = (from: Date, to: Date) => ctx().db.$queryRaw<{ hora: number; pedidos: number; total: string }[]>`
  SELECT EXTRACT(HOUR FROM o.created_at)::int AS hora, COUNT(*)::int AS pedidos, SUM(o.total)::text AS total
    FROM core_orders o WHERE o.tenant_id = ${ctx().tenantId}::uuid AND o.module_key = 'FOOD' AND o.status <> 'CANCELLED' AND o.created_at BETWEEN ${from} AND ${to}
   GROUP BY 1 ORDER BY 1`;

export const desempenhoEntregadores = (from: Date, to: Date) => ctx().db.$queryRaw<{ entregador: string; entregas: number; falhas: number; tempo_medio_min: number | null; taxas: string }[]>`
  SELECT c.name AS entregador,
         COUNT(*) FILTER (WHERE d.status = 'DELIVERED')::int AS entregas,
         COUNT(*) FILTER (WHERE d.status = 'FAILED')::int AS falhas,
         AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.picked_up_at)) / 60) FILTER (WHERE d.status = 'DELIVERED')::float AS tempo_medio_min,
         COALESCE(SUM(d.fee) FILTER (WHERE d.status = 'DELIVERED'), 0)::text AS taxas
    FROM food_deliveries d JOIN food_couriers c ON c.id = d.courier_id
   WHERE d.tenant_id = ${ctx().tenantId}::uuid AND d.created_at BETWEEN ${from} AND ${to}
   GROUP BY 1 ORDER BY 2 DESC`;
