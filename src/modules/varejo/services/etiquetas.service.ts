// modules/varejo/services/etiquetas.service.ts — lote de etiquetas (preço + código de barras).
// Gera a ESTRUTURA do lote; a renderização (PDF/ZPL) é um adaptador por modelo, plugado depois.
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';

export async function criarLote(input: { templateId?: string; itens: { variantId: string; quantity: number }[] }) {
  const { db, tenantId } = ctx();
  const templateId = input.templateId ?? (await db.retailLabelTemplate.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id;
  if (!templateId) throw AppError.validation('Sem modelo de etiqueta. Cadastre um modelo padrão.');
  return db.retailLabelBatch.create({
    data: { tenantId, templateId, items: { create: input.itens.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) } },
    include: { items: { include: { variant: { include: { product: { select: { name: true, salePrice: true } } } } } }, template: true },
  });
}

/** O payload que o renderizador recebe: uma linha por etiqueta física. */
export async function expandirLote(batchId: string) {
  const b = await ctx().db.retailLabelBatch.findUnique({
    where: { id: batchId },
    include: { template: true, items: { include: { variant: { include: { product: true } } } } },
  });
  if (!b) throw AppError.notFound('Lote');
  const etiquetas = b.items.flatMap((i) => Array.from({ length: i.quantity }, () => ({
    sku: i.variant.sku, barcode: i.variant.barcode ?? i.variant.sku,
    nome: i.variant.product.name, variante: i.variant.name,
    preco: i.variant.priceOverride ?? i.variant.product.salePrice,
  })));
  return { template: b.template, etiquetas };
}

export const listarModelos = () => ctx().db.retailLabelTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
export async function criarModelo(input: { name: string; widthMm: number; heightMm: number; layout?: Record<string, unknown>; isDefault?: boolean }) {
  const { db, tenantId } = ctx();
  if (input.isDefault) await db.retailLabelTemplate.updateMany({ where: {}, data: { isDefault: false } });
  return db.retailLabelTemplate.create({ data: { ...input, tenantId, layout: (input.layout ?? {}) as never } });
}
export const marcarImpresso = (batchId: string) => ctx().db.retailLabelBatch.update({ where: { id: batchId }, data: { status: 'PRINTED', printedAt: new Date() } });

/**
 * Render ZPL (Zebra/Argox/Elgin): o formato que 90% das impressoras térmicas de loja falam.
 * 8 dots/mm (203 dpi). Layout: nome, variante, preço grande, Code128 com o código de barras.
 * Um `^XA…^XZ` por etiqueta; o navegador/agente manda o texto cru para a impressora.
 */
export async function renderZpl(batchId: string): Promise<string> {
  const { template, etiquetas } = await expandirLote(batchId);
  const dpmm = 8;
  const W = Math.round(Number(template.widthMm) * dpmm);
  const H = Math.round(Number(template.heightMm) * dpmm);
  const fmt = (v: unknown) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
  const esc = (s: string) => s.replace(/[\^~]/g, ' ').slice(0, 28);
  return etiquetas.map((e) => [
    '^XA', `^PW${W}`, `^LL${H}`, '^CI28',
    `^FO16,12^A0N,26,26^FD${esc(e.nome)}^FS`,
    e.variante ? `^FO16,42^A0N,22,22^FD${esc(e.variante)}^FS` : '',
    `^FO16,${Math.max(70, H - 110)}^A0N,40,40^FD${fmt(e.preco)}^FS`,
    `^FO16,${Math.max(118, H - 62)}^BY2,2,44^BCN,44,Y,N,N^FD${e.barcode}^FS`,
    '^XZ',
  ].filter(Boolean).join('\n')).join('\n');
}
