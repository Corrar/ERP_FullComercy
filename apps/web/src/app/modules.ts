// src/app/modules.ts — O REGISTRO DE MÓDULOS DO FRONT. Espelha o do back: cada módulo declara
// chave, rótulo, rotas e itens de menu (com a permissão que cada um exige). O shell só mostra o
// que a empresa tem ATIVO e o usuário PODE. Um módulo novo = uma pasta em src/modules + 1 linha.
import type { ModuleKey } from '@/lib/session';
import type { RouteObject } from 'react-router-dom';
import { varejoModule } from '@/modules/varejo';
import { foodModule } from '@/modules/food';
import { academiaModule } from '@/modules/academia';
import { servicosModule } from '@/modules/servicos';

export interface NavItem { to: string; label: string; perm?: string }
export interface FrontModule { key: ModuleKey; label: string; nav: NavItem[]; routes: RouteObject[] }

export const MODULES: FrontModule[] = [varejoModule, foodModule, academiaModule, servicosModule];

/** Menu do núcleo (sempre presente; a permissão filtra). */
export const CORE_NAV: NavItem[] = [
  { to: '/', label: 'Painel' },
  { to: '/pedidos', label: 'Pedidos', perm: 'core.orders:view' },
  { to: '/clientes', label: 'Clientes', perm: 'core.customers:view' },
  { to: '/produtos', label: 'Produtos', perm: 'core.products:view' },
  { to: '/estoque', label: 'Estoque', perm: 'core.stock:view' },
  { to: '/compras', label: 'Compras', perm: 'core.purchases:view' },
  { to: '/financeiro', label: 'Financeiro', perm: 'core.finance:view' },
];
export const ADMIN_NAV: NavItem[] = [
  { to: '/usuarios', label: 'Usuários', perm: 'core.users:view' },
  { to: '/perfis', label: 'Perfis e permissões', perm: 'core.roles:manage' },
  { to: '/integracoes', label: 'Integrações', perm: 'core.webhooks:manage' },
  { to: '/empresa', label: 'Empresa e módulos', perm: 'core.tenant:manage' },
];
