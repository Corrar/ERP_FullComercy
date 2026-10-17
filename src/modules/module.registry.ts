// src/modules/module.registry.ts — registro em memória dos módulos instalados no PRODUTO
// (não confundir com os módulos ATIVOS numa EMPRESA, que vivem em `core_tenant_modules`).
import type { Express, RequestHandler } from 'express';
import type { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from './module.contract';
import { registerPermissions } from '../core/rbac/permissions';
import { salesStrategies } from '../core/orders/sales-strategy';
import { requireModule } from './require-module.middleware';

class ModuleRegistry {
  private readonly defs = new Map<ModuleKey, ModuleDefinition>();

  register(def: ModuleDefinition) {
    if (this.defs.has(def.key)) throw new Error(`Módulo registrado duas vezes: ${def.key}`);
    this.defs.set(def.key, def);
    registerPermissions(def.permissions.map((p) => ({ ...p, module: def.key })));
    if (def.salesStrategy) salesStrategies.register(def.salesStrategy);
  }

  get(key: ModuleKey) { return this.defs.get(key); }
  all(): ModuleDefinition[] { return [...this.defs.values()]; }

  /** Monta `/m/<basePath>` (autenticado + módulo ativo) e `/public/<basePath>` (se houver). */
  mountAuthenticated(app: Express, ...before: RequestHandler[]) {
    for (const def of this.defs.values()) {
      app.use(`/m/${def.basePath}`, ...before, requireModule(def.key), def.router);
      console.log(`[modules] ${def.key} → /m/${def.basePath}`);
    }
  }

  mountPublic(app: Express) {
    for (const def of this.defs.values()) {
      if (def.publicRouter) {
        app.use(`/public/${def.basePath}`, def.publicRouter);
        console.log(`[modules] ${def.key} (público) → /public/${def.basePath}`);
      }
    }
  }
}

export const moduleRegistry = new ModuleRegistry();
