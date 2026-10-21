// src/core/billing/catalog.ts — O CATÁLOGO DA LOJA DE MÓDULOS: o que se vende, quanto custa e o
// que cada função LIBERA. É a fonte única do preço: o front mostra o que `quote()` devolve, o
// checkout recalcula aqui, e o `rbac.service` usa `permissions` para cortar o que não foi pago.
//
// Uma função = um pacote de chaves de permissão do catálogo (`rbac/permissions.ts` + módulos).
// Contratar a função libera as chaves; não contratar some com o menu (front) e dá 403 (API).
// `test/billing-catalog.test.ts` prova que TODA chave cobrada por rota está em alguma função —
// chave fora do catálogo de venda seria uma tela que ninguém consegue comprar.
//
// Regras de montagem (`resolveSelection`):
//   • `core.base` entra sempre (painel, usuários, empresa, assinatura);
//   • todo módulo escolhido traz a sua função `required` (sem PDV não há Varejo);
//   • `requires` puxa as dependências, transitivamente (Compras precisa de Produtos e estoque);
//   • pelo menos um módulo: a loja vende um ERP para um tipo de comércio, não só o núcleo.
import { ModuleKey, Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { D, sum } from '../../shared/money';

export interface Feature {
  key: string;
  /** NULL = função do núcleo (serve a qualquer comércio). */
  module: ModuleKey | null;
  label: string;
  description: string;
  /** Mensalidade em R$, string decimal (regra da casa: dinheiro nunca é número binário). */
  price: string;
  /** Vem junto com o módulo, não se desmarca. */
  required?: boolean;
  /** Outras funções sem as quais esta não funciona. */
  requires?: string[];
  /** Chaves de permissão que a função libera. */
  permissions: string[];
}

export interface ModuleOffer {
  key: ModuleKey;
  name: string;
  tagline: string;
  /** Para quem é — vira o texto do cartão na escolha do comércio. */
  forWho: string;
}

export const MODULE_OFFERS: ModuleOffer[] = [
  { key: ModuleKey.VAREJO, name: 'Varejo', tagline: 'Loja, PDV e estoque', forWho: 'Lojas de roupa, calçados, presentes, mercadinhos e conveniências.' },
  { key: ModuleKey.FOOD, name: 'Food & Delivery', tagline: 'Mesas, cozinha e entrega', forWho: 'Restaurantes, lanchonetes, hamburguerias, pizzarias e bares.' },
  { key: ModuleKey.ACADEMIA, name: 'Academia', tagline: 'Planos, recepção e turmas', forWho: 'Academias, estúdios, escolas de luta, dança e natação.' },
  { key: ModuleKey.SERVICOS, name: 'Serviços / Oficina', tagline: 'Ordens de serviço e agenda', forWho: 'Oficinas mecânicas, assistências técnicas, lava-rápidos e prestadores.' },
];

export const FEATURES: Feature[] = [
  // ── Núcleo ────────────────────────────────────────────────────────────────────────────
  { key: 'core.base', module: null, required: true, price: '39.90', label: 'Base do sistema',
    description: 'Painel do dia, usuários, perfis de acesso, dados da empresa, notificações e assinatura.',
    permissions: ['core.tenant:manage', 'core.users:view', 'core.users:manage', 'core.roles:manage', 'core.billing:manage'] },
  { key: 'core.clientes', module: null, price: '9.90', label: 'Clientes',
    description: 'Cadastro de clientes com endereços, histórico de compras e total gasto.',
    permissions: ['core.customers:view', 'core.customers:manage'] },
  { key: 'core.produtos', module: null, price: '14.90', label: 'Produtos e estoque',
    description: 'Catálogo com variantes, saldo por depósito, estoque mínimo, transferência e inventário.',
    permissions: ['core.products:view', 'core.products:manage', 'core.stock:view', 'core.stock:move'] },
  { key: 'core.pedidos', module: null, price: '9.90', label: 'Pedidos e vendas',
    description: 'Lista e detalhe de todas as vendas, com cancelamento e histórico de status.',
    permissions: ['core.orders:view', 'core.orders:create', 'core.orders:cancel'] },
  { key: 'core.compras', module: null, price: '19.90', label: 'Compras e fornecedores', requires: ['core.produtos', 'core.financeiro'],
    description: 'Pedido de compra, recebimento parcial, custo médio, contas a pagar e devolução ao fornecedor.',
    permissions: ['core.purchases:view', 'core.purchases:manage', 'core.suppliers:manage'] },
  { key: 'core.financeiro', module: null, price: '24.90', label: 'Financeiro',
    description: 'Contas a pagar e a receber, baixas, contas e categorias, fluxo de caixa.',
    permissions: ['core.finance:view', 'core.finance:manage'] },
  { key: 'core.cobranca', module: null, price: '14.90', label: 'Cobrança online', requires: ['core.pedidos'],
    description: 'Cobrar o cliente por PIX ou link de pagamento, com baixa automática no pedido.',
    permissions: ['core.payments:manage'] },
  { key: 'core.integracoes', module: null, price: '19.90', label: 'Integrações (webhooks)',
    description: 'Avisos assinados para outros sistemas a cada venda, pagamento ou mudança de estoque.',
    permissions: ['core.webhooks:manage'] },

  // ── Varejo ────────────────────────────────────────────────────────────────────────────
  { key: 'varejo.pdv', module: ModuleKey.VAREJO, required: true, price: '39.90', label: 'PDV e caixa',
    requires: ['core.pedidos', 'core.produtos', 'core.clientes'],
    description: 'Frente de caixa com leitor de código, pagamento misto, troco, abertura e fechamento de caixa.',
    permissions: ['varejo.pdv:operate', 'varejo.pdv:close'] },
  { key: 'varejo.grade', module: ModuleKey.VAREJO, price: '14.90', label: 'Grade de tamanho e cor',
    description: 'Gera as variantes do produto pela grade (P/M/G × cores) com SKU e código de barras.',
    permissions: ['varejo.grade:manage'] },
  { key: 'varejo.etiquetas', module: ModuleKey.VAREJO, price: '9.90', label: 'Etiquetas',
    description: 'Etiquetas com preço e código de barras em PDF, por lote ou por produto.',
    permissions: ['varejo.etiquetas:print'] },
  { key: 'varejo.comissoes', module: ModuleKey.VAREJO, price: '19.90', label: 'Comissões de vendedores',
    description: 'Vendedores, regras de comissão e apuração por período.',
    permissions: ['varejo.comissoes:view', 'varejo.comissoes:manage'] },
  { key: 'varejo.devolucoes', module: ModuleKey.VAREJO, price: '14.90', label: 'Trocas e devoluções', requires: ['core.financeiro'],
    description: 'Troca, devolução com estorno ou vale-compra abatido na próxima venda.',
    permissions: ['varejo.devolucoes:manage'] },
  { key: 'varejo.relatorios', module: ModuleKey.VAREJO, price: '14.90', label: 'Relatórios da loja',
    description: 'Curva ABC, vendas por vendedor, por forma de pagamento e ticket médio.',
    permissions: ['varejo.relatorios:view'] },

  // ── Food & Delivery ───────────────────────────────────────────────────────────────────
  { key: 'food.salao', module: ModuleKey.FOOD, required: true, price: '39.90', label: 'Salão e cardápio',
    requires: ['core.pedidos', 'core.produtos'],
    description: 'Mesas, comandas, rodadas, divisão e fechamento de conta; cardápio com adicionais.',
    permissions: ['food.salao:operate', 'food.salao:manage', 'food.salao:close', 'food.cardapio:manage'] },
  { key: 'food.cozinha', module: ModuleKey.FOOD, price: '24.90', label: 'Cozinha (KDS)',
    description: 'Tela da cozinha em tempo real por estação, com tempo de preparo e baixa da ficha técnica.',
    permissions: ['food.cozinha:view', 'food.cozinha:update'] },
  { key: 'food.delivery', module: ModuleKey.FOOD, price: '29.90', label: 'Delivery e entregadores', requires: ['core.clientes'],
    description: 'Despacho de entregas, entregadores, zonas e taxas por CEP e acerto do entregador.',
    permissions: ['food.delivery:operate', 'food.delivery:manage'] },
  { key: 'food.relatorios', module: ModuleKey.FOOD, price: '14.90', label: 'Relatórios do restaurante',
    description: 'Mais vendidos, tempo de cozinha, vendas por canal e por garçom.',
    permissions: ['food.relatorios:view'] },

  // ── Academia ──────────────────────────────────────────────────────────────────────────
  { key: 'gym.matriculas', module: ModuleKey.ACADEMIA, required: true, price: '39.90', label: 'Planos e matrículas',
    requires: ['core.clientes', 'core.pedidos'],
    description: 'Planos mensais, trimestrais e anuais, matrícula, pausa, troca de plano e cobrança recorrente.',
    permissions: ['gym.planos:view', 'gym.planos:manage', 'gym.matriculas:view', 'gym.matriculas:manage'] },
  { key: 'gym.recepcao', module: ModuleKey.ACADEMIA, price: '19.90', label: 'Recepção e check-in',
    description: 'Check-in do aluno na recepção com aviso de mensalidade em atraso.',
    permissions: ['gym.acesso:operate'] },
  { key: 'gym.catraca', module: ModuleKey.ACADEMIA, price: '29.90', label: 'Catraca e credenciais', requires: ['gym.recepcao'],
    description: 'Integração com catraca: credenciais (cartão, QR, biometria) e liberação automática.',
    permissions: ['gym.acesso:manage'] },
  { key: 'gym.turmas', module: ModuleKey.ACADEMIA, price: '19.90', label: 'Turmas e aulas',
    description: 'Agenda de turmas, reservas de vaga e chamada pelo instrutor.',
    permissions: ['gym.turmas:view', 'gym.turmas:manage'] },

  // ── Serviços / Oficina ────────────────────────────────────────────────────────────────
  { key: 'svc.os', module: ModuleKey.SERVICOS, required: true, price: '39.90', label: 'Ordens de serviço',
    requires: ['core.pedidos', 'core.clientes', 'core.produtos'],
    description: 'OS com orçamento, aprovação, peças e mão de obra, painel kanban por status.',
    permissions: ['svc.os:view', 'svc.os:update', 'svc.catalogo:manage'] },
  { key: 'svc.veiculos', module: ModuleKey.SERVICOS, price: '9.90', label: 'Veículos',
    description: 'Cadastro de veículos por placa com histórico de serviços.',
    permissions: ['svc.veiculos:manage'] },
  { key: 'svc.agenda', module: ModuleKey.SERVICOS, price: '19.90', label: 'Agenda',
    description: 'Agendamento de atendimentos e conversão do agendamento em OS.',
    permissions: ['svc.agenda:operate'] },
  { key: 'svc.relatorios', module: ModuleKey.SERVICOS, price: '14.90', label: 'Relatórios da oficina',
    description: 'Faturamento por serviço, por técnico e tempo médio de OS.',
    permissions: ['svc.relatorios:view'] },
];

const BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));
export const featureByKey = (key: string) => BY_KEY.get(key);

export type ItemReason = 'selected' | 'required' | 'dependency';
export interface ResolvedItem { key: string; module: ModuleKey | null; label: string; price: string; reason: ItemReason; requiredBy?: string }
export interface Resolved {
  modules: ModuleKey[];
  items: ResolvedItem[];
  total: Prisma.Decimal;
  permissions: Set<string>;
}

/**
 * Monta o plano a partir do que a pessoa marcou (`modules` = comércios escolhidos, `features` =
 * funções marcadas). Devolve a lista FINAL, com o motivo de cada item entrar — a tela usa o motivo
 * para travar o que é obrigatório e explicar por quê.
 */
export function resolveSelection(input: { modules: ModuleKey[]; features: string[] }): Resolved {
  const unknown = input.features.filter((k) => !BY_KEY.has(k));
  if (unknown.length) throw AppError.validation(`Função desconhecida: ${unknown.join(', ')}.`, { unknown });

  const modules = new Set<ModuleKey>(input.modules);
  for (const k of input.features) { const m = BY_KEY.get(k)!.module; if (m) modules.add(m); }
  if (!modules.size) throw AppError.validation('Escolha o tipo do seu comércio (um módulo) para montar o ERP.');

  const chosen = new Map<string, { reason: ItemReason; requiredBy?: string }>();
  const add = (key: string, reason: ItemReason, requiredBy?: string) => {
    const prev = chosen.get(key);
    // "Selecionado" perde para "obrigatório": se o sistema exige, a tela não deixa desmarcar.
    if (prev && (prev.reason !== 'selected' || reason === 'selected')) return;
    chosen.set(key, { reason, requiredBy });
  };
  add('core.base', 'required');
  for (const f of FEATURES) if (f.required && f.module && modules.has(f.module)) add(f.key, 'required');
  for (const k of input.features) add(k, 'selected');

  // Dependências, até parar de crescer (o grafo é pequeno e acíclico; o limite é só cinto).
  for (let guard = 0; guard < 10; guard++) {
    let grew = false;
    for (const [k] of [...chosen]) {
      for (const dep of BY_KEY.get(k)!.requires ?? []) {
        if (!chosen.has(dep)) { add(dep, 'dependency', k); grew = true; }
        else if (chosen.get(dep)!.reason === 'selected') add(dep, 'dependency', k);
      }
    }
    if (!grew) break;
  }

  // Ordem do catálogo: núcleo primeiro, depois cada módulo — é a ordem em que a tela lista.
  const items: ResolvedItem[] = FEATURES.filter((f) => chosen.has(f.key)).map((f) => ({
    key: f.key, module: f.module, label: f.label, price: f.price, ...chosen.get(f.key)!,
  }));
  const permissions = new Set<string>();
  for (const it of items) for (const p of BY_KEY.get(it.key)!.permissions) permissions.add(p);
  return { modules: [...modules], items, total: sum(items.map((i) => D(i.price))), permissions };
}

/** Chaves de permissão liberadas por uma lista de funções já contratadas (itens da assinatura). */
export function permissionsForFeatures(keys: string[]): Set<string> {
  const out = new Set<string>();
  for (const k of keys) for (const p of BY_KEY.get(k)?.permissions ?? []) out.add(p);
  return out;
}
