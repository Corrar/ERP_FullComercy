// src/core/tenancy/tenant-context.ts — O CONTEXTO DA REQUISIÇÃO, visível de qualquer service
// sem passar parâmetro. É AsyncLocalStorage: cada request tem o seu, e um `await` não vaza
// contexto para outra request.
//
// Por que não `req.tenantId`? Porque service não recebe `req`. Passar `tenantId` em todo
// método de todo service funciona até o dia em que alguém esquece um — e aí o esquecimento
// vira vazamento entre empresas. Aqui o tenant é ambiente, não argumento.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ModuleKey, Prisma } from '@prisma/client';
import type { TenantDb } from '../../infra/prisma';
import { AppError } from '../../shared/errors';

export interface RequestContext {
  tenantId: string;
  tenantSlug: string;
  /** `Tenant.settings` já lido (defaultSalesModule, moeda…). */
  tenantSettings: Record<string, unknown>;
  /** Módulos ATIVOS desta empresa, com a config de cada um. */
  modules: Map<ModuleKey, Prisma.JsonValue>;
  userId: string | null;
  /** Client Prisma que injeta `tenantId` em toda operação (ver infra/prisma.ts). */
  db: TenantDb;
  ip?: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => als.run(ctx, fn);

/** O contexto atual. Lança se chamado fora de uma request/job com tenant — nunca devolve
 *  um "tenant padrão" calado, que seria o caminho para gravar dado na empresa errada. */
export function ctx(): RequestContext {
  const c = als.getStore();
  if (!c) throw new AppError('INTERNAL', 'Operação sem contexto de tenant.');
  return c;
}

export const currentTenantId = (): string => ctx().tenantId;
export const currentDb = (): TenantDb => ctx().db;
export const isModuleActive = (key: ModuleKey): boolean => ctx().modules.has(key);
export const moduleConfig = <T = Record<string, unknown>>(key: ModuleKey): T =>
  ((ctx().modules.get(key) ?? {}) as unknown) as T;
