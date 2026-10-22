// modules/food/services/cardapio.service.ts — o CARDÁPIO: menus, categorias, itens, adicionais.
// A rota pública lê por slug (tenant + menu) sem login e por isso usa o client base com o
// tenant filtrado à mão — um dos poucos lugares autorizados a isso.
import { prisma } from '../../../infra/prisma';
import { randomBytes } from 'node:crypto';
import { createProduct } from '../../../core/inventory/products.service';
import { AppError } from '../../../shared/errors';
import { ctx } from '../../../core/tenancy/tenant-context';

export async function cardapioPublico(tenantSlug: string, menuSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, status: true, settings: true, modules: { where: { moduleKey: 'FOOD', enabled: true } } } });
  if (!tenant || tenant.status !== 'ACTIVE' || !tenant.modules.length) throw AppError.notFound('Cardápio');
  const menu = await prisma.foodMenu.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: menuSlug } },
    include: {
      categories: { orderBy: { position: 'asc' }, include: { items: { where: { isAvailable: true }, orderBy: { position: 'asc' }, include: { modifierGroups: { orderBy: { position: 'asc' }, include: { group: { include: { modifiers: { where: { isActive: true }, orderBy: { position: 'asc' } } } } } } } } } },
    },
  });
  if (!menu?.isPublished) throw AppError.notFound('Cardápio');
  const zonas = await prisma.foodDeliveryZone.findMany({ where: { tenantId: tenant.id, isActive: true }, select: { id: true, name: true, fee: true, etaMin: true } });
  return {
    loja: { nome: tenant.name, slug: tenantSlug },
    menu: { id: menu.id, name: menu.name, availability: menu.availability, abertoAgora: abertoAgora(menu.availability as never) },
    categorias: menu.categories.map((c) => ({ id: c.id, name: c.name, itens: c.items.map((i) => ({ id: i.id, variantId: i.variantId, nome: i.displayName, descricao: i.description, preco: i.price, imagem: i.imageUrl, prepTimeMin: i.prepTimeMin, adicionais: i.modifierGroups.map((g) => g.group) })) })),
    zonasEntrega: zonas,
  };
}

/** Janela de funcionamento: [{ days:[1..7 ou 0..6], from:"11:00", to:"15:00" }]. Vazio = sempre. */
export function abertoAgora(availability: { days?: number[]; from?: string; to?: string }[] | null | undefined, agora = new Date()): boolean {
  if (!availability?.length) return true;
  const hhmm = agora.toTimeString().slice(0, 5);
  return availability.some((w) => (!w.days?.length || w.days.includes(agora.getDay())) && (!w.from || hhmm >= w.from) && (!w.to || hhmm <= w.to));
}

// ── CRUD autenticado ──
export const listarMenus = () => ctx().db.foodMenu.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: 'asc' } });
export const criarMenu = (input: { name: string; slug: string; availability?: unknown[] }) => ctx().db.foodMenu.create({ data: { ...input, tenantId: ctx().tenantId, availability: (input.availability ?? []) as never } });
export const atualizarMenu = (id: string, input: { name?: string; isPublished?: boolean; availability?: unknown[] }) => ctx().db.foodMenu.update({ where: { id }, data: { ...input, availability: input.availability as never } });
export async function menuCompleto(id: string) {
  const m = await ctx().db.foodMenu.findUnique({ where: { id }, include: { categories: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' }, include: { variant: { select: { sku: true } }, modifierGroups: { include: { group: true } } } } } } } });
  if (!m) throw AppError.notFound('Cardápio');
  return m;
}
export const criarCategoria = (menuId: string, input: { name: string; position?: number }) => ctx().db.foodMenuCategory.create({ data: { ...input, menuId, tenantId: ctx().tenantId } });
/** Item do cardápio. Sem `variantId` (restaurante recém-aberto não tem produto nenhum), o prato
 *  nasce com o produto dele no core — sem controle de saldo (quem baixa estoque é a ficha técnica). */
export async function criarItem(menuId: string, input: { categoryId?: string; variantId?: string; displayName: string; description?: string; price: number; imageUrl?: string; station?: string; prepTimeMin?: number; position?: number }) {
  let variantId = input.variantId;
  if (!variantId) {
    const base = input.displayName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'PRATO';
    const p = await createProduct({ name: input.displayName, sku: `${base}-${randomBytes(2).toString('hex').toUpperCase()}`, salePrice: input.price, trackStock: false, description: input.description });
    variantId = p.variants[0].id;
  }
  return ctx().db.foodMenuItem.create({ data: { ...input, variantId, menuId, tenantId: ctx().tenantId } });
}
export const atualizarItem = (id: string, input: { categoryId?: string | null; displayName?: string; description?: string; price?: number; imageUrl?: string | null; station?: string; prepTimeMin?: number | null; isAvailable?: boolean; position?: number }) =>
  ctx().db.foodMenuItem.update({ where: { id }, data: input });

export const listarGruposAdicionais = () => ctx().db.foodModifierGroup.findMany({ include: { modifiers: { orderBy: { position: 'asc' } } }, orderBy: { name: 'asc' } });
export const criarGrupoAdicionais = (input: { name: string; minSelect?: number; maxSelect?: number; modifiers?: { name: string; price?: number }[] }) =>
  ctx().db.foodModifierGroup.create({ data: { name: input.name, minSelect: input.minSelect, maxSelect: input.maxSelect, tenantId: ctx().tenantId, modifiers: { create: (input.modifiers ?? []).map((m, i) => ({ ...m, position: i })) } }, include: { modifiers: true } });
export const ligarGrupoAoItem = (menuItemId: string, groupId: string, position = 0) => ctx().db.foodMenuItemModifierGroup.create({ data: { tenantId: ctx().tenantId, menuItemId, groupId, position } });

// ── Ficha técnica (insumos por item do cardápio) ──
export async function definirFicha(menuItemId: string, insumos: { ingredientVariantId: string; quantity: number }[]) {
  const { db, tenantId } = ctx();
  const { tenantTransaction } = await import('../../../infra/prisma');
  return tenantTransaction(db, tenantId, async (tx) => {
    if (!(await tx.foodMenuItem.findUnique({ where: { id: menuItemId } }))) throw AppError.notFound('Item do cardápio');
    await tx.foodRecipeItem.deleteMany({ where: { menuItemId } });
    await tx.foodRecipeItem.createMany({ data: insumos.map((i) => ({ tenantId, menuItemId, ingredientVariantId: i.ingredientVariantId, quantity: i.quantity })) });
    return tx.foodRecipeItem.findMany({ where: { menuItemId }, include: { ingredient: { select: { sku: true, product: { select: { name: true, unit: true, costPrice: true } } } } } });
  });
}
export const fichaDoItem = (menuItemId: string) => ctx().db.foodRecipeItem.findMany({ where: { menuItemId }, include: { ingredient: { select: { sku: true, product: { select: { name: true, unit: true, costPrice: true } } } } } });

/** CMV teórico do item = Σ insumo × custo médio. Para comparar com o preço do cardápio. */
export async function custoDoItem(menuItemId: string) {
  const [ficha, item] = await Promise.all([fichaDoItem(menuItemId), ctx().db.foodMenuItem.findUnique({ where: { id: menuItemId } })]);
  const { D, round2 } = await import('../../../shared/money');
  const custo = round2(ficha.reduce((s, f) => s.plus(D(f.quantity).mul(f.ingredient.product.costPrice)), D(0)));
  const preco = D(item?.price ?? 0);
  return { menuItemId, custo, preco, margem: preco.isZero() ? null : round2(preco.minus(custo).div(preco).mul(100)) };
}
