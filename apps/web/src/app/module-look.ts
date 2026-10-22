// src/app/module-look.ts — a APARÊNCIA de cada módulo (ícone e cor), como o seletor de módulos do
// Fluxo: cada módulo tem a sua cor e ela pinta o item ativo, os botões e a loja. É só visual —
// nome, preço e o que o módulo faz vêm da API (`/public/billing/catalog`).
import type { CSSProperties } from 'react';
import type { ModuleKey } from '@/lib/session';

export const MODULE_LOOK: Record<ModuleKey, { icon: string; accent: string }> = {
  VAREJO: { icon: 'store', accent: '#2563eb' },
  FOOD: { icon: 'utensils', accent: '#ea580c' },
  ACADEMIA: { icon: 'dumbbell', accent: '#7c3aed' },
  SERVICOS: { icon: 'wrench', accent: '#0d9488' },
  BELEZA: { icon: 'scissors', accent: '#db2777' },
  PET: { icon: 'paw', accent: '#ca8a04' },
  CLINICA: { icon: 'stethoscope', accent: '#0891b2' },
  HOTEL: { icon: 'bed', accent: '#4f46e5' },
};

/** `style` que troca a cor de destaque de um contêiner (o CSS lê `--accent`). */
export const accentStyle = (m?: ModuleKey | null): CSSProperties => (m ? ({ ['--accent' as string]: MODULE_LOOK[m].accent } as CSSProperties) : {});

/** Ícone de cada item de menu, pela rota (o menu do Shell e o da prévia usam a mesma tabela). */
export const NAV_ICON: Record<string, string> = {
  '/': 'home', '/pedidos': 'receipt', '/clientes': 'users', '/produtos': 'box', '/estoque': 'grid', '/compras': 'truck', '/financeiro': 'dollar',
  '/usuarios': 'user', '/perfis': 'shield', '/integracoes': 'link', '/empresa': 'building', '/assinatura': 'card',
  '/varejo/pdv': 'monitor', '/varejo/caixa': 'dollar', '/varejo/grade': 'grid', '/varejo/etiquetas': 'tag', '/varejo/comissoes': 'users', '/varejo/devolucoes': 'undo', '/varejo/relatorios': 'chart',
  '/food/salao': 'utensils', '/food/cozinha': 'flame', '/food/entregas': 'truck', '/food/cardapio': 'clipboard',
  '/academia': 'chart', '/academia/recepcao': 'userCheck', '/academia/matriculas': 'clipboard', '/academia/planos': 'tag', '/academia/turmas': 'calendar', '/academia/acesso': 'idCard',
  '/servicos': 'clipboard', '/servicos/nova': 'plus', '/servicos/agenda': 'calendar', '/servicos/veiculos': 'car',
  '/beleza/agenda': 'calendar', '/beleza/comandas': 'receipt', '/beleza/cadastros': 'scissors', '/beleza/pacotes': 'gift', '/beleza/comissoes': 'users', '/beleza/relatorios': 'chart',
  '/pet/pets': 'paw', '/pet/banho-tosa': 'sparkles', '/pet/balcao': 'monitor', '/pet/veterinaria': 'syringe', '/pet/relatorios': 'chart',
  '/clinica/agenda': 'calendar', '/clinica/pacientes': 'heart', '/clinica/cadastros': 'stethoscope', '/clinica/convenios': 'shield', '/clinica/relatorios': 'chart',
  '/hotel/painel': 'bed', '/hotel/reservas': 'calendar', '/hotel/quartos': 'grid', '/hotel/relatorios': 'chart',
};
