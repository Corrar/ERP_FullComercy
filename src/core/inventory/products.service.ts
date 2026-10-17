// src/core/inventory/products.service.ts — produto SEMPRE nasce com uma variante.
// Sem grade: uma variante padrão (sku = sku do produto). Com grade: o módulo Varejo gera as
// variantes pela matriz (grade.service.ts) — mas a tabela é a mesma do core.
import { ProductKind } from '@prisma/client';
import { ctx } from '../tenancy/tenant-context';
import { AppError } from '../../shared/errors';

export interface CreateProductInput {
  name: string;
  sku: string;
  barcode?: string;
  kind?: ProductKind;
  unit?: string;
  categoryId?: string;
  costPrice?: number;
  salePrice?: number;
  trackStock?: boolean;
  hasVariants?: boolean;
  description?: string;
}

export async function createProduct(input: CreateProductInput) {
  const { db, tenantId } = ctx();
  const kind = input.kind ?? ProductKind.GOOD;
  return db.product.create({
    data: {
      tenantId,
      name: input.name,
      kind,
      unit: input.unit ?? 'UN',
      categoryId: input.categoryId,
      costPrice: input.costPrice ?? 0,
      salePrice: input.salePrice ?? 0,
      // Serviço nunca controla saldo, diga o que disser a entrada.
      trackStock: kind === ProductKind.SERVICE ? false : (input.trackStock ?? true),
      hasVariants: input.hasVariants ?? false,
      description: input.description,
      variants: input.hasVariants
        ? undefined
        : { create: { sku: input.sku, barcode: input.barcode, isDefault: true } },
    },
    include: { variants: true },
  });
}

export async function listProducts(q?: string) {
  return ctx().db.product.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { variants: { some: { OR: [{ sku: { contains: q, mode: 'insensitive' } }, { barcode: q }] } } }] } : undefined,
    include: { variants: { where: { isActive: true } }, category: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
}

/** Resolve o que o PDV digitou/bipou: SKU, código de barras ou id de variante. */
export async function findVariantByCode(code: string) {
  const v = await ctx().db.productVariant.findFirst({
    where: { isActive: true, OR: [{ sku: code }, { barcode: code }, ...(isUuid(code) ? [{ id: code }] : [])] },
    include: { product: true },
  });
  if (!v) throw AppError.notFound(`Item "${code}"`);
  return v;
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function defaultWarehouseId(): Promise<string> {
  const w = await ctx().db.warehouse.findFirst({ where: { isDefault: true, isActive: true }, select: { id: true } });
  if (!w) throw new AppError('INTERNAL', 'Empresa sem armazém padrão. Rode o onboarding.');
  return w.id;
}
