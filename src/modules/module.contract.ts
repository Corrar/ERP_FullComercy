// src/modules/module.contract.ts — O QUE UM MÓDULO É, do ponto de vista do core.
//
// O core não importa nada de `modules/varejo/services/*`. Ele só conhece ESTA interface. Um
// módulo é um pacote que, no boot, se apresenta ao registro dizendo: minha chave, meu router,
// minhas permissões e (se vendo alguma coisa) minha estratégia de venda. Desligar o módulo
// para uma empresa = o router responde 403 e a estratégia deixa de ser candidata. Remover o
// módulo do produto = apagar a pasta e uma linha em `modules/index.ts`.
import type { Router } from 'express';
import type { ModuleKey } from '@prisma/client';
import type { PermissionDef } from '../core/rbac/permissions';
import type { SalesStrategy } from '../core/orders/sales-strategy';

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  /** Prefixo HTTP. Ex.: 'varejo' → rotas em `/m/varejo/...`. */
  basePath: string;
  /** Chaves de permissão que o módulo expõe (entram no catálogo com `module = key`). */
  permissions: PermissionDef[];
  /** Router já com as rotas do módulo; o registro põe `requireModule(key)` na frente. */
  router: Router;
  /** Estratégia de venda do módulo. Módulo que não vende (só cadastro) não declara. */
  salesStrategy?: SalesStrategy;
  /** Rotas PÚBLICAS (sem login) — ex.: cardápio online, webhook da catraca. Montadas em
   *  `/public/<basePath>` e o módulo é responsável por autenticar do jeito que fizer sentido. */
  publicRouter?: Router;
  /** Gancho de onboarding: semear dados padrão quando a empresa liga o módulo. */
  onEnable?(tenantId: string): Promise<void>;
}
