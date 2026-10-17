// modules/varejo/services/grade.service.ts — a GRADE (tamanho × cor) gera variantes do core.
// O core só conhece `ProductVariant.attributes` (JSON); a semântica "eixos ordenados, matriz,
// SKU derivado" é daqui.
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';

export interface GerarGradeInput {
  productId: string;
  skuBase: string;
  /** Ex.: { "Tamanho": ["P","M","G"], "Cor": ["Azul","Preto"] } → 6 variantes. */
  eixos: Record<string, string[]>;
}

export async function gerarGrade(input: GerarGradeInput) {
  const { db, tenantId } = ctx();
  const product = await db.product.findUnique({ where: { id: input.productId } });
  if (!product) throw AppError.notFound('Produto');
  if (!product.hasVariants) throw AppError.validation('Produto não está marcado como "com grade".');

  // Garante eixos e valores (idempotente), na ordem informada.
  const eixoRows = [] as { axisId: string; nome: string; valores: { id: string; value: string }[] }[];
  let pos = 0;
  for (const [nome, valores] of Object.entries(input.eixos)) {
    const axis = await db.retailGradeAxis.upsert({
      where: { tenantId_name: { tenantId, name: nome } }, create: { tenantId, name: nome, position: pos++ }, update: {},
    });
    const vals = [] as { id: string; value: string }[];
    for (const [i, value] of valores.entries()) {
      const v = await db.retailGradeValue.upsert({
        where: { tenantId_axisId_value: { tenantId, axisId: axis.id, value } },
        create: { tenantId, axisId: axis.id, value, position: i }, update: {},
      });
      vals.push({ id: v.id, value: v.value });
    }
    eixoRows.push({ axisId: axis.id, nome, valores: vals });
  }

  // Produto cartesiano.
  const combos = eixoRows.reduce<{ axisId: string; nome: string; valueId: string; value: string }[][]>(
    (acc, eixo) => acc.flatMap((c) => eixo.valores.map((v) => [...c, { axisId: eixo.axisId, nome: eixo.nome, valueId: v.id, value: v.value }])),
    [[]],
  );

  const criadas = [];
  for (const combo of combos) {
    const sufixo = combo.map((c) => slug(c.value)).join('-');
    const sku = `${input.skuBase}-${sufixo}`.toUpperCase();
    const attributes = Object.fromEntries(combo.map((c) => [c.nome, c.value]));
    const variant = await db.productVariant.upsert({
      where: { tenantId_sku: { tenantId, sku } },
      create: {
        tenantId, productId: product.id, sku, name: combo.map((c) => c.value).join(' / '), attributes,
        retailAttrs: { create: combo.map((c) => ({ axisId: c.axisId, valueId: c.valueId })) },
      },
      update: {},
    });
    criadas.push(variant);
  }
  return criadas;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').slice(0, 12);

/** Matriz de saldo por grade: linhas = eixo 1, colunas = eixo 2. Para a tela de estoque. */
export async function matrizDeEstoque(productId: string, warehouseId?: string) {
  const variants = await ctx().db.productVariant.findMany({
    where: { productId, isActive: true },
    include: { balances: warehouseId ? { where: { warehouseId } } : true, retailAttrs: { include: { axis: true, value: true }, orderBy: { axis: { position: 'asc' } } } },
  });
  return variants.map((v) => ({
    variantId: v.id, sku: v.sku,
    celula: v.retailAttrs.map((a) => ({ eixo: a.axis.name, valor: a.value.value })),
    onHand: v.balances.reduce((s, b) => s.plus(b.onHand), v.balances.length ? v.balances[0].onHand.minus(v.balances[0].onHand) : (0 as never)),
  }));
}
