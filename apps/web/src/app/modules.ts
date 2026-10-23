// src/app/modules.ts — O REGISTRO DE MÓDULOS DO FRONT. Espelha o do back: cada módulo declara
// chave, rótulo, rotas e itens de menu (com a permissão que cada um exige). O shell só mostra o
// que a empresa tem ATIVO e o usuário PODE. Um módulo novo = uma pasta em src/modules + 1 linha.
import type { ModuleKey } from '@/lib/session';
import type { RouteObject } from 'react-router-dom';
import { varejoModule } from '@/modules/varejo';
import { foodModule } from '@/modules/food';
import { academiaModule } from '@/modules/academia';
import { servicosModule } from '@/modules/servicos';
import { belezaModule } from '@/modules/beleza';
import { petModule } from '@/modules/pet';
import { clinicaModule } from '@/modules/clinica';
import { hotelModule } from '@/modules/hotel';

export interface NavItem { to: string; label: string; perm?: string }
export interface FrontModule { key: ModuleKey; label: string; nav: NavItem[]; routes: RouteObject[] }

export const MODULES: FrontModule[] = [varejoModule, foodModule, academiaModule, servicosModule, belezaModule, petModule, clinicaModule, hotelModule];

/** Menu do núcleo (sempre presente; a permissão filtra). */
export const CORE_NAV: NavItem[] = [
  { to: '/', label: 'Painel' },
  { to: '/pedidos', label: 'Pedidos', perm: 'core.orders:view' },
  { to: '/clientes', label: 'Clientes', perm: 'core.customers:view' },
  { to: '/produtos', label: 'Produtos', perm: 'core.products:view' },
  { to: '/estoque', label: 'Estoque', perm: 'core.stock:view' },
  { to: '/compras', label: 'Compras', perm: 'core.purchases:view' },
  { to: '/financeiro', label: 'Financeiro', perm: 'core.finance:view' },
  { to: '/cobrancas', label: 'Cobranças online', perm: 'core.payments:manage' },
];
export const ADMIN_NAV: NavItem[] = [
  { to: '/usuarios', label: 'Usuários', perm: 'core.users:view' },
  { to: '/perfis', label: 'Perfis e permissões', perm: 'core.roles:manage' },
  { to: '/integracoes', label: 'Integrações', perm: 'core.webhooks:manage' },
  { to: '/empresa', label: 'Empresa e módulos', perm: 'core.tenant:manage' },
  { to: '/auditoria', label: 'Auditoria', perm: 'core.tenant:manage' },
  { to: '/assinatura', label: 'Assinatura', perm: 'core.billing:manage' },
];

export interface NavGroup { key: string; label: string; module?: ModuleKey; items: NavItem[] }

/** O MENU, montado num lugar só: o Shell (com a sessão real) e a PRÉVIA da loja (com as chaves
 *  do carrinho) chamam esta função — por isso a prévia mostra exatamente o menu que a empresa
 *  vai ter. Grupo sem item visível some (nada de título órfão). */
export function buildNav(can: (perm: string) => boolean, hasModule: (m: ModuleKey) => boolean): NavGroup[] {
  const keep = (items: NavItem[]) => items.filter((n) => !n.perm || can(n.perm));
  const groups: NavGroup[] = [
    { key: 'core', label: 'Núcleo', items: keep(CORE_NAV) },
    ...MODULES.filter((m) => hasModule(m.key)).map((m) => ({ key: m.key, label: m.label, module: m.key, items: keep(m.nav) })),
    { key: 'admin', label: 'Administração', items: keep(ADMIN_NAV) },
  ];
  return groups.filter((g) => g.items.length);
}
