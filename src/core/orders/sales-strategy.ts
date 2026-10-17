// src/core/orders/sales-strategy.ts — O CONTRATO entre o pedido genérico e os módulos.
//
// O `OrderService` sabe criar um pedido com itens, total, estoque e financeiro. O que ele NÃO
// sabe é o que um pedido significa para cada nicho: no varejo nasce pago e consome estoque na
// hora; no restaurante nasce aberto numa comanda e vai para a cozinha; na oficina nasce como
// OS aguardando aprovação e só baixa peça quando o serviço começa. Cada uma dessas respostas é
// uma `SalesStrategy`. O core escolhe UMA por pedido (ver `resolveSalesStrategy`) e delega a
// ela os pontos de decisão abaixo, sempre dentro da MESMA transação.
import type { ModuleKey, Order, OrderChannel, OrderItemKind, OrderStatus, Prisma } from '@prisma/client';
import type { TenantTx } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { ctx } from '../tenancy/tenant-context';

/** O que o cliente HTTP manda. Itens podem vir por id de variante ou por código bipado. */
export interface DraftItem {
  variantId?: string;
  code?: string;                 // SKU ou código de barras (PDV)
  kind?: OrderItemKind;          // default PRODUCT; SERVICE/FEE para linhas sem variante
  description?: string;          // obrigatório quando não há variante
  quantity: number;
  unitPrice?: number;            // ausente = preço de tabela
  discount?: number;
  metadata?: Record<string, unknown>;
}

export interface DraftPayment {
  method: Prisma.OrderPaymentCreateInput['method'];
  amount: number;
  installments?: number;
  reference?: string;
}

export interface OrderDraft {
  /** Módulo pedido explicitamente pelo cliente. Opcional: o core resolve se faltar. */
  moduleKey?: ModuleKey | null;
  channel?: OrderChannel;
  customerId?: string | null;
  warehouseId?: string | null;
  sellerUserId?: string | null;
  items: DraftItem[];
  payments?: DraftPayment[];
  discount?: number;
  surcharge?: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  /** Dados que SÓ o módulo entende (mesa, vendedor, veículo, plano…). O core só repassa. */
  moduleData?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

/** Item já resolvido e precificado pelo core, antes de persistir. */
export interface PricedItem {
  variantId: string | null;
  productId: string | null;
  kind: OrderItemKind;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
  trackStock: boolean;
  metadata: Record<string, unknown>;
}

/** Como o pedido trata o estoque ao nascer. */
export type StockPolicy = 'CONSUME' | 'RESERVE' | 'NONE';

export type OrderWithItems = Order & { items: { id: string; variantId: string | null; quantity: Prisma.Decimal; kind: OrderItemKind }[] };

export interface SalesStrategy {
  /** NULL só para a estratégia do core (venda simples). */
  readonly moduleKey: ModuleKey | null;
  readonly name: string;
  /** Canais que esta estratégia atende; desempata quando há mais de um módulo de venda ativo. */
  readonly channels: readonly OrderChannel[];

  /** Status do core com que o pedido nasce. */
  initialStatus(draft: OrderDraft): OrderStatus;
  /** Política de estoque na criação. */
  stockPolicy(draft: OrderDraft): StockPolicy;
  /** Se `true`, pagamento que cobre o total leva o pedido a COMPLETED automaticamente (PDV). */
  completeOnFullPayment(draft: OrderDraft): boolean;

  /** Rejeita o rascunho antes de qualquer escrita (mesa inexistente, caixa fechado…). */
  validate?(draft: OrderDraft): Promise<void>;
  /** Reprecifica (cardápio tem preço próprio; plano da academia; mão de obra). */
  price?(items: PricedItem[], draft: OrderDraft): Promise<PricedItem[]>;
  /** Cria a extensão 1:1 e efeitos do módulo. MESMA transação do pedido. */
  afterCreate?(tx: TenantTx, order: OrderWithItems, items: PricedItem[], draft: OrderDraft): Promise<void>;
  /** Reage a transição do status do core (ex.: COMPLETED → gera comissão). */
  afterStatusChange?(tx: TenantTx, order: OrderWithItems, from: OrderStatus, to: OrderStatus): Promise<void>;
  /** Transições extras/restritas além do padrão do core. */
  allowedTransitions?(): Partial<Record<OrderStatus, OrderStatus[]>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO + RESOLUÇÃO
// ─────────────────────────────────────────────────────────────────────────────

class SalesStrategyRegistry {
  private readonly byModule = new Map<ModuleKey, SalesStrategy>();
  private core!: SalesStrategy;

  registerCore(s: SalesStrategy) { this.core = s; }

  register(s: SalesStrategy) {
    if (!s.moduleKey) throw new Error('Estratégia de módulo precisa de moduleKey.');
    if (this.byModule.has(s.moduleKey)) throw new Error(`Estratégia duplicada para ${s.moduleKey}`);
    this.byModule.set(s.moduleKey, s);
  }

  coreStrategy(): SalesStrategy { return this.core; }

  /** Estratégia de um pedido JÁ gravado: pelo `moduleKey` dele. Módulo desligado depois do
   *  pedido existir ainda resolve (o pedido antigo precisa poder ser cancelado/consultado). */
  forOrder(moduleKey: ModuleKey | null): SalesStrategy {
    return (moduleKey && this.byModule.get(moduleKey)) || this.core;
  }

  /**
   * A DECISÃO: qual módulo de venda atende este rascunho, para a empresa logada.
   *
   *   1. Cliente mandou `moduleKey`?  → tem de estar ATIVO na empresa (senão 403
   *      MODULE_INACTIVE). Módulo ativo mas sem estratégia (só cadastro) → core.
   *   2. Candidatas = estratégias cujo módulo está ativo na empresa.
   *   3. Nenhuma → venda simples do core.
   *   4. Uma → ela. (É o caso de 90% das empresas: uma loja É varejo, um restaurante É food.)
   *   5. Várias (posto com loja de conveniência + lanchonete, academia que vende suplemento):
   *      a) o `channel` do rascunho casa com exatamente uma → ela;
   *      b) senão, `Tenant.settings.defaultSalesModule` (escolhido na tela da empresa);
   *      c) senão, 422 MODULE_AMBIGUOUS com a lista — o front mostra o seletor e reenvia com
   *         `moduleKey`. Adivinhar aqui seria gravar a venda no módulo errado em silêncio.
   */
  resolve(draft: Pick<OrderDraft, 'moduleKey' | 'channel'>): SalesStrategy {
    const { modules, tenantSettings } = ctx();

    if (draft.moduleKey) {
      if (!modules.has(draft.moduleKey)) {
        throw new AppError('MODULE_INACTIVE', `O módulo ${draft.moduleKey} não está ativo para esta empresa.`);
      }
      return this.byModule.get(draft.moduleKey) ?? this.core;
    }

    const candidates = [...this.byModule.values()].filter((s) => s.moduleKey && modules.has(s.moduleKey));
    if (candidates.length === 0) return this.core;
    if (candidates.length === 1) return candidates[0];

    if (draft.channel) {
      const byChannel = candidates.filter((s) => s.channels.includes(draft.channel!));
      if (byChannel.length === 1) return byChannel[0];
    }

    const preferred = tenantSettings.defaultSalesModule as ModuleKey | undefined;
    if (preferred) {
      const s = candidates.find((c) => c.moduleKey === preferred);
      if (s) return s;
    }

    throw new AppError(
      'MODULE_AMBIGUOUS',
      'Mais de um módulo de venda está ativo. Informe `moduleKey` ou defina o módulo padrão da empresa.',
      { candidates: candidates.map((c) => c.moduleKey) },
    );
  }
}

export const salesStrategies = new SalesStrategyRegistry();
