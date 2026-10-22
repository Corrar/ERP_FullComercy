// src/core/inventory/catalog.service.ts — armazéns, categorias, variantes e edição de produto.
import { ctx } from '../tenancy/tenant-context';
import { AppError } from '../../shared/errors';
import { paginar, type Paginacao } from '../../shared/paginacao';

// ── Armazéns ──
export const listWarehouses = () => ctx().db.warehouse.findMany({ orderBy: [{ isDefault: 'desc' }, { code: 'asc' }] });
export async function createWarehouse(input: { code: string; name: string; isDefault?: boolean }) {
  const { db, tenantId } = ctx();
  if (input.isDefault) await db.warehouse.updateMany({ where: {}, data: { isDefault: false } });
  return db.warehouse.create({ data: { ...input, tenantId, code: input.code.toUpperCase() } });
}
export async function updateWarehouse(id: string, input: { name?: string; isActive?: boolean; isDefault?: boolean }) {
  const { db } = ctx();
  if (input.isDefault) await db.warehouse.updateMany({ where: {}, data: { isDefault: false } });
  return db.warehouse.update({ where: { id }, data: input });
}

// ── Categorias ──
export const listCategories = () => ctx().db.productCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true } } } });
export const createCategory = (input: { name: string; parentId?: string; position?: number }) => ctx().db.productCategory.create({ data: { ...input, tenantId: ctx().tenantId } });
export const updateCategory = (id: string, input: { name?: string; parentId?: string | null; position?: number }) => ctx().db.productCategory.update({ where: { id }, data: input });

// ── Produto ──
export async function getProduct(id: string) {
  const p = await ctx().db.product.findUnique({ where: { id }, include: { variants: { include: { balances: { include: { warehouse: { select: { code: true } } } } } }, category: true } });
  if (!p) throw AppError.notFound('Produto');
  return p;
}
export const updateProduct = (id: string, input: { name?: string; description?: string; categoryId?: string | null; unit?: string; costPrice?: number; salePrice?: number; trackStock?: boolean; isActive?: boolean; imageUrl?: string | null; attributes?: Record<string, unknown> }) =>
  ctx().db.product.update({ where: { id }, data: { ...input, attributes: input.attributes as never } });

// ── Variantes ──
export async function createVariant(productId: string, input: { sku: string; barcode?: string; name?: string; attributes?: Record<string, unknown>; priceOverride?: number; costOverride?: number }) {
  const { db, tenantId } = ctx();
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p) throw AppError.notFound('Produto');
  if (!p.hasVariants) await db.product.update({ where: { id: productId }, data: { hasVariants: true } });
  return db.productVariant.create({ data: { ...input, tenantId, productId, attributes: (input.attributes ?? {}) as never } });
}
export const updateVariant = (id: string, input: { sku?: string; barcode?: string | null; name?: string; priceOverride?: number | null; costOverride?: number | null; isActive?: boolean }) =>
  ctx().db.productVariant.update({ where: { id }, data: input });

/** Define o mínimo por (variante, armazém). Cria a linha de saldo se ainda não existe. */
export async function setMinLevel(variantId: string, warehouseId: string, minLevel: number | null) {
  const { db, tenantId } = ctx();
  return db.stockBalance.upsert({
    where: { tenantId_variantId_warehouseId: { tenantId, variantId, warehouseId } },
    create: { tenantId, variantId, warehouseId, minLevel }, update: { minLevel },
  });
}

export async function lowStock() {
  return ctx().db.$queryRaw<{ variant_id: string; sku: string; product: string; warehouse: string; on_hand: string; reserved: string; min_level: string }[]>`
    SELECT b.variant_id, v.sku, p.name AS product, w.code AS warehouse, b.on_hand, b.reserved, b.min_level
      FROM core_stock_balances b
      JOIN core_product_variants v ON v.id = b.variant_id
      JOIN core_products p ON p.id = v.product_id
      JOIN core_warehouses w ON w.id = b.warehouse_id
     WHERE b.tenant_id = ${ctx().tenantId}::uuid AND b.min_level IS NOT NULL AND b.on_hand <= b.min_level
     ORDER BY (b.on_hand / NULLIF(b.min_level, 0)) ASC`;
}

export async function ledger(filter: { variantId?: string; warehouseId?: string; refType?: string; from?: Date; to?: Date; take?: number } & Paginacao) {
  const where = { variantId: filter.variantId, warehouseId: filter.warehouseId, refType: filter.refType, createdAt: { gte: filter.from, lte: filter.to } };
  return paginar(filter, Math.min(filter.take ?? 200, 1000), async (skip, take) => (await ctx().db.stockMovement.findMany({
    where, include: { variant: { select: { sku: true, product: { select: { name: true } } } }, warehouse: { select: { code: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }, skip, take,
  })).map((r) => ({ ...r, id: r.id.toString() })), () => ctx().db.stockMovement.count({ where }));
}
