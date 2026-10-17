// modules/food/services/cardapio.service.ts — o cardápio ONLINE. A rota pública lê por slug
// (tenant + menu) sem login; por isso usa o client base e filtra o tenant à mão.
import { prisma } from '../../../infra/prisma';
import { AppError } from '../../../shared/errors';
import { ctx } from '../../../core/tenancy/tenant-context';

export async function cardapioPublico(tenantSlug: string, menuSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true, status: true, modules: { where: { moduleKey: 'FOOD', enabled: true } } } });
  if (!tenant || tenant.status !== 'ACTIVE' || !tenant.modules.length) throw AppError.notFound('Cardápio');
  const menu = await prisma.foodMenu.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: menuSlug } },
    include: {
      categories: { orderBy: { position: 'asc' }, include: { items: { where: { isAvailable: true }, orderBy: { position: 'asc' }, include: { modifierGroups: { include: { group: { include: { modifiers: { where: { isActive: true } } } } } } } } } },
    },
  });
  if (!menu?.isPublished) throw AppError.notFound('Cardápio');
  return { loja: tenant.name, menu: { id: menu.id, name: menu.name, availability: menu.availability }, categorias: menu.categories };
}

export async function listarMenus() {
  return ctx().db.foodMenu.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: 'asc' } });
}
