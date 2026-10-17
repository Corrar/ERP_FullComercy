// modules/varejo/services/relatorios.service.ts — relatórios da loja. SQL direto, por tenant.
import { ctx } from '../../../core/tenancy/tenant-context';

export async function vendasPorVendedor(from: Date, to: Date) {
  return ctx().db.$queryRaw<{ vendedor: string; vendas: number; total: string; comissao: string }[]>`
    SELECT COALESCE(sp.name, '(sem vendedor)') AS vendedor, COUNT(*)::int AS vendas, SUM(o.total)::text AS total, SUM(s.commission_amount)::text AS comissao
      FROM ret_sales s JOIN core_orders o ON o.id = s.order_id
      LEFT JOIN ret_salespeople sp ON sp.id = s.salesperson_id
     WHERE s.tenant_id = ${ctx().tenantId}::uuid AND o.status = 'COMPLETED' AND o.completed_at BETWEEN ${from} AND ${to}
     GROUP BY 1 ORDER BY SUM(o.total) DESC`;
}

export async function vendasPorHora(from: Date, to: Date) {
  return ctx().db.$queryRaw<{ hora: number; vendas: number; total: string }[]>`
    SELECT EXTRACT(HOUR FROM o.completed_at)::int AS hora, COUNT(*)::int AS vendas, SUM(o.total)::text AS total
      FROM core_orders o WHERE o.tenant_id = ${ctx().tenantId}::uuid AND o.module_key = 'VAREJO' AND o.status = 'COMPLETED' AND o.completed_at BETWEEN ${from} AND ${to}
     GROUP BY 1 ORDER BY 1`;
}

/** Curva ABC por produto (80/15/5 do faturamento). */
export async function curvaAbc(from: Date, to: Date) {
  const rows = await ctx().db.$queryRaw<{ produto: string; sku: string; qtd: string; total: string }[]>`
    SELECT p.name AS produto, v.sku, SUM(i.quantity)::text AS qtd, SUM(i.total)::text AS total
      FROM core_order_items i JOIN core_orders o ON o.id = i.order_id
      JOIN core_product_variants v ON v.id = i.variant_id JOIN core_products p ON p.id = v.product_id
     WHERE i.tenant_id = ${ctx().tenantId}::uuid AND o.module_key = 'VAREJO' AND o.status = 'COMPLETED' AND o.completed_at BETWEEN ${from} AND ${to}
     GROUP BY 1, 2 ORDER BY SUM(i.total) DESC`;
  const total = rows.reduce((a, r) => a + Number(r.total), 0);
  let acc = 0;
  return rows.map((r) => { acc += Number(r.total); const pct = total ? acc / total : 0; return { ...r, participacao: total ? Number(r.total) / total : 0, classe: pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C' }; });
}

/** Grade parada: variantes com saldo e sem venda há N dias. */
export async function semGiro(dias = 60) {
  return ctx().db.$queryRaw<{ sku: string; produto: string; variante: string | null; saldo: string; ultima_venda: Date | null }[]>`
    SELECT v.sku, p.name AS produto, v.name AS variante, SUM(b.on_hand)::text AS saldo,
           (SELECT MAX(o.completed_at) FROM core_order_items i JOIN core_orders o ON o.id = i.order_id WHERE i.variant_id = v.id AND o.status = 'COMPLETED') AS ultima_venda
      FROM core_product_variants v JOIN core_products p ON p.id = v.product_id JOIN core_stock_balances b ON b.variant_id = v.id
     WHERE v.tenant_id = ${ctx().tenantId}::uuid AND v.is_active
     GROUP BY v.id, p.name
    HAVING SUM(b.on_hand) > 0 AND COALESCE((SELECT MAX(o.completed_at) FROM core_order_items i JOIN core_orders o ON o.id = i.order_id WHERE i.variant_id = v.id AND o.status = 'COMPLETED'), '1970-01-01') < now() - make_interval(days => ${dias})
     ORDER BY ultima_venda NULLS FIRST`;
}
