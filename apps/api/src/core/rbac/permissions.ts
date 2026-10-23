// src/core/rbac/permissions.ts — O CATÁLOGO de chaves de permissão.
// Formato: `<dono>.<recurso>:<ação>`. Dono é `core` ou a chave do módulo em minúsculo.
// As chaves do core moram aqui; as de módulo são DECLARADAS pelo módulo (`ModuleDefinition.
// permissions`) e registradas no boot — o core não conhece 'food.cozinha:update' de antemão.
import type { ModuleKey } from '@prisma/client';

export interface PermissionDef {
  key: string;
  label: string;
  /** NULL = core. Preenchido = só aparece na tela se o módulo estiver ativo. */
  module: ModuleKey | null;
}

export const CORE_PERMISSIONS: PermissionDef[] = [
  { key: 'core.tenant:manage',      label: 'Gerir empresa e módulos',      module: null },
  { key: 'core.users:view',         label: 'Ver usuários',                 module: null },
  { key: 'core.users:manage',       label: 'Criar/editar usuários',        module: null },
  { key: 'core.roles:manage',       label: 'Gerir perfis e permissões',    module: null },
  { key: 'core.customers:view',     label: 'Ver clientes',                 module: null },
  { key: 'core.customers:manage',   label: 'Criar/editar clientes',        module: null },
  { key: 'core.customers:lgpd',     label: 'Atender titular (LGPD): exportar e anonimizar dados de cliente', module: null },
  { key: 'core.products:view',      label: 'Ver produtos',                 module: null },
  { key: 'core.products:manage',    label: 'Criar/editar produtos',        module: null },
  { key: 'core.stock:view',         label: 'Ver estoque',                  module: null },
  { key: 'core.stock:move',         label: 'Movimentar estoque',           module: null },
  { key: 'core.orders:view',        label: 'Ver pedidos/vendas',           module: null },
  { key: 'core.orders:create',      label: 'Criar pedidos/vendas',         module: null },
  { key: 'core.orders:cancel',      label: 'Cancelar pedidos/vendas',      module: null },
  { key: 'core.finance:view',       label: 'Ver financeiro',               module: null },
  { key: 'core.finance:manage',     label: 'Lançar/baixar títulos',        module: null },
  { key: 'core.purchases:view',     label: 'Ver compras e fornecedores',   module: null },
  { key: 'core.purchases:manage',   label: 'Criar/receber compras',        module: null },
  { key: 'core.suppliers:manage',   label: 'Cadastrar fornecedores',       module: null },
  { key: 'core.payments:manage',    label: 'Cobrar online (PIX/link)',     module: null },
  { key: 'core.webhooks:manage',    label: 'Integrações (webhooks)',       module: null },
  { key: 'core.billing:manage',     label: 'Gerir assinatura e pagamento', module: null },
];

const registry = new Map<string, PermissionDef>(CORE_PERMISSIONS.map((p) => [p.key, p]));

export function registerPermissions(defs: PermissionDef[]) {
  for (const d of defs) {
    if (registry.has(d.key)) throw new Error(`Permissão duplicada no catálogo: ${d.key}`);
    registry.set(d.key, d);
  }
}

export const allPermissions = (): PermissionDef[] => [...registry.values()];
export const permissionExists = (key: string): boolean => registry.has(key);

/** Perfil-semente de toda empresa nova. `admin` é bypass (não precisa de linhas na matriz). */
export const SYSTEM_ROLES = {
  ADMIN: 'admin',
} as const;
