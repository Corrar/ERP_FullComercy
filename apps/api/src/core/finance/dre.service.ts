// src/core/finance/dre.service.ts — DRE SIMPLES pelo regime de caixa: o que entrou e o que saiu no
// período (baixas), agrupado pela categoria do título; título sem categoria cai no grupo da origem
// (vendas, compras, comissões…). Baixa por vale-troca (STORE_CREDIT) fica de fora: não é dinheiro,
// é a mesma dívida trocando de mão (sai do vale e entra na venda nova).
import PDFDocument from 'pdfkit';
import { ctx } from '../tenancy/tenant-context';
import { D, round2, sum } from '../../shared/money';

const ORIGEM: Record<string, string> = {
  ORDER: 'Vendas', PURCHASE: 'Compras', PURCHASE_RETURN: 'Devoluções a fornecedor', COMMISSION: 'Comissões', BEL_COMMISSION: 'Comissões',
  RETURN: 'Devoluções a clientes', GYM_MEMBERSHIP: 'Mensalidades', POS_CASH: 'Sangria e suprimento de caixa', MANUAL: 'Lançamentos manuais',
};

export interface LinhaDre { grupo: string; total: string }
export interface Dre { de: Date; ate: Date; receitas: LinhaDre[]; despesas: LinhaDre[]; totalReceitas: string; totalDespesas: string; resultado: string }

export async function dre(from: Date, to: Date): Promise<Dre> {
  const rows = await ctx().db.$queryRaw<{ kind: 'RECEIVABLE' | 'PAYABLE'; categoria: string | null; origem: string; total: string }[]>`
    SELECT e.kind, c.name AS categoria, e.origin AS origem, SUM(p.amount)::text AS total
      FROM core_finance_payments p
      JOIN core_finance_entries e ON e.id = p.entry_id
      LEFT JOIN core_finance_categories c ON c.id = e.category_id
     WHERE p.tenant_id = ${ctx().tenantId}::uuid AND p.paid_at >= ${from} AND p.paid_at < ${to}
       AND p.method <> 'STORE_CREDIT' AND e.status <> 'CANCELLED'
     GROUP BY 1, 2, 3`;
  const agrupar = (kind: string) => {
    const m = new Map<string, ReturnType<typeof D>>();
    for (const r of rows.filter((x) => x.kind === kind)) { const g = r.categoria ?? ORIGEM[r.origem] ?? r.origem; m.set(g, (m.get(g) ?? D(0)).plus(r.total)); }
    return [...m.entries()].map(([grupo, t]) => ({ grupo, total: round2(t).toString() })).sort((a, b) => Number(b.total) - Number(a.total));
  };
  const receitas = agrupar('RECEIVABLE'); const despesas = agrupar('PAYABLE');
  const tr = round2(sum(receitas.map((r) => D(r.total)))); const td = round2(sum(despesas.map((r) => D(r.total))));
  return { de: from, ate: to, receitas, despesas, totalReceitas: tr.toString(), totalDespesas: td.toString(), resultado: round2(tr.minus(td)).toString() };
}

const brl = (v: string | number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

/** O mesmo DRE em PDF (A4), para mandar ao contador. */
export async function drePdf(r: Dre, empresa: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c));
  const fim = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));
  doc.fontSize(16).text(empresa).fontSize(12).fillColor('#555').text(`Demonstração de resultado (regime de caixa) · ${dia(r.de)} a ${dia(new Date(r.ate.getTime() - 1))}`).moveDown();
  const bloco = (titulo: string, linhas: LinhaDre[], total: string) => {
    doc.fillColor('#000').fontSize(12).text(titulo, { underline: true }).moveDown(0.3).fontSize(11);
    if (!linhas.length) doc.fillColor('#777').text('Nada no período.');
    for (const l of linhas) { const y = doc.y; doc.fillColor('#000').text(l.grupo, 60, y, { width: 330 }); doc.text(brl(l.total), 400, y, { width: 140, align: 'right' }); }
    const y = doc.y + 4; doc.font('Helvetica-Bold').text(`Total de ${titulo.toLowerCase()}`, 60, y, { width: 330 }).text(brl(total), 400, y, { width: 140, align: 'right' }).font('Helvetica').moveDown();
  };
  bloco('Receitas', r.receitas, r.totalReceitas);
  bloco('Despesas', r.despesas, r.totalDespesas);
  const y = doc.y + 6; doc.fontSize(13).font('Helvetica-Bold').text('Resultado do período', 60, y, { width: 330 }).fillColor(Number(r.resultado) < 0 ? '#b91c1c' : '#15803d').text(brl(r.resultado), 400, y, { width: 140, align: 'right' });
  doc.font('Helvetica').fillColor('#777').fontSize(9).text(`Gerado em ${new Date().toLocaleString('pt-BR')}. Baixas por vale-troca não entram (não são caixa).`, 50, 780);
  doc.end();
  return fim;
}
