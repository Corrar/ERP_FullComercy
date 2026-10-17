// src/core/tenancy/run-as-tenant.ts — executa `fn` DENTRO do contexto de uma empresa sem haver
// request HTTP: jobs de plataforma (cobrança recorrente), rotas públicas que descobrem o tenant
// pelo slug (cardápio online, webhook da catraca) e scripts operacionais.
// `userId` NULL marca que ninguém humano fez: auditoria e histórico gravam "sistema".
import { prismaForTenant } from '../../infra/prisma';
import { loadTenantSnapshot } from './tenant-modules.service';
import { runWithContext } from './tenant-context';
import { prisma } from '../../infra/prisma';
import { AppError } from '../../shared/errors';

export async function runAsTenant<T>(tenantId: string, fn: () => Promise<T>, userId: string | null = null): Promise<T> {
  const snap = await loadTenantSnapshot(tenantId);
  return runWithContext(
    { tenantId: snap.id, tenantSlug: snap.slug, tenantSettings: snap.settings, modules: snap.modules, userId, db: prismaForTenant(snap.id) },
    fn,
  );
}

/** Mesma coisa, descobrindo o tenant pelo slug público. 404 se não existir ou não estiver ativo. */
export async function runAsTenantSlug<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!t || t.status !== 'ACTIVE') throw AppError.notFound('Empresa');
  return runAsTenant(t.id, fn);
}

/** Itera todos os tenants com um módulo ativo (para jobs). */
export async function forEachTenantWithModule(moduleKey: 'VAREJO' | 'FOOD' | 'ACADEMIA' | 'SERVICOS', fn: (tenantId: string) => Promise<void>) {
  const rows = await prisma.tenantModule.findMany({ where: { moduleKey, enabled: true, tenant: { status: 'ACTIVE' } }, select: { tenantId: true } });
  for (const { tenantId } of rows) {
    try { await runAsTenant(tenantId, () => fn(tenantId)); }
    catch (e) { console.error(`[job] tenant ${tenantId} falhou:`, e instanceof Error ? e.message : e); }
  }
  return rows.length;
}
