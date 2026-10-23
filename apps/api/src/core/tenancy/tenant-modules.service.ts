// src/core/tenancy/tenant-modules.service.ts — "quais módulos ESTA empresa tem ligados?"
// É a pergunta mais feita do sistema (toda request passa por ela), então tem cache em memória
// com TTL curto e invalidação explícita quando alguém liga/desliga um módulo.
import { ModuleKey, Prisma } from '@prisma/client';
import { prisma } from '../../infra/prisma';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors';
import { permissionsForFeatures } from '../billing/catalog';

export interface TenantSnapshot {
  id: string;
  slug: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
  modules: Map<ModuleKey, Prisma.JsonValue>;
  /** Chaves de permissão que o PLANO libera. `null` = empresa sem assinatura da loja (criada pela
   *  plataforma ou pelo seed): nada é cortado, vale só o perfil. */
  planKeys: Set<string> | null;
}

/** O que de `settings` pode ir para a tela. `payments` fica no servidor: guarda credencial de
 *  gateway (selada, mas ninguém precisa dela no navegador) e cada tela lê a sua rota de config. */
export function settingsParaTela(settings: Record<string, unknown> | null | undefined) {
  const { payments: _privado, ...resto } = (settings ?? {}) as Record<string, unknown>;
  return resto;
}

const cache = new Map<string, { at: number; snap: TenantSnapshot }>();

export function invalidateTenantCache(tenantId: string) {
  cache.delete(tenantId);
}

/** Carrega tenant + módulos ativos. Usa o client BASE porque ainda não existe contexto. */
export async function loadTenantSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < env.TENANT_CACHE_TTL_MS) return hit.snap;

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      modules: { where: { enabled: true }, select: { moduleKey: true, config: true } },
      subscription: { select: { status: true, items: { select: { featureKey: true } } } },
    },
  });
  if (!t) throw AppError.notFound('Empresa');

  const snap: TenantSnapshot = {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    settings: (t.settings ?? {}) as Record<string, unknown>,
    modules: new Map(t.modules.map((m) => [m.moduleKey, m.config])),
    planKeys: t.subscription ? permissionsForFeatures(t.subscription.items.map((i) => i.featureKey)) : null,
  };
  cache.set(tenantId, { at: Date.now(), snap });
  return snap;
}

export async function listModules(tenantId: string) {
  return prisma.tenantModule.findMany({ where: { tenantId }, orderBy: { moduleKey: 'asc' } });
}

/** Liga (ou religa) um módulo. `config` substitui a anterior quando enviada. */
export async function enableModule(tenantId: string, key: ModuleKey, config?: Prisma.InputJsonValue) {
  const row = await prisma.tenantModule.upsert({
    where: { tenantId_moduleKey: { tenantId, moduleKey: key } },
    create: { tenantId, moduleKey: key, enabled: true, config: config ?? {} },
    update: { enabled: true, enabledAt: new Date(), ...(config !== undefined ? { config } : {}) },
  });
  invalidateTenantCache(tenantId);
  return row;
}

export async function disableModule(tenantId: string, key: ModuleKey) {
  const row = await prisma.tenantModule.update({
    where: { tenantId_moduleKey: { tenantId, moduleKey: key } },
    data: { enabled: false },
  });
  invalidateTenantCache(tenantId);
  return row;
}
