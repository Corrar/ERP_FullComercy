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
