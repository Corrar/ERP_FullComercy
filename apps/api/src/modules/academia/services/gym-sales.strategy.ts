// modules/academia/services/gym-sales.strategy.ts — como a ACADEMIA vende.
// A "venda" principal é a ADESÃO a um plano: o pedido do core registra a matrícula (taxa de
// adesão + 1ª mensalidade) e, ao ser pago, nasce a `GymMembership` com a recorrência armada.
// Produto avulso (suplemento, garrafa) também passa aqui, como venda de balcão.
import { ModuleKey, OrderChannel, OrderItemKind, OrderStatus } from '@prisma/client';
import type { SalesStrategy, OrderDraft } from '../../../core/orders/sales-strategy';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';
import { criarMatricula } from './assinaturas.service';

interface GymModuleData { planId?: string; startDate?: string; autoRenew?: boolean }
const md = (d: OrderDraft) => (d.moduleData ?? {}) as GymModuleData;

export const gymSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.ACADEMIA,
  name: 'Academia · Planos e balcão',
  channels: [OrderChannel.SUBSCRIPTION, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',       // só afeta itens com trackStock (suplemento); plano não tem
  completeOnFullPayment: () => true,

  async validate(draft) {
    const m = md(draft);
    if (m.planId) {
      if (!draft.customerId) throw AppError.validation('Adesão a plano exige cliente (aluno).');
      const plan = await ctx().db.gymPlan.findUnique({ where: { id: m.planId } });
      if (!plan?.isActive) throw AppError.notFound('Plano');
      const ativa = await ctx().db.gymMembership.findFirst({ where: { customerId: draft.customerId, status: { in: ['ACTIVE', 'PAUSED', 'OVERDUE'] } } });
      if (ativa) throw AppError.conflict('Aluno já possui matrícula ativa. Faça a troca de plano pela matrícula.');
    }
  },

  /** Injeta as linhas do plano: taxa de adesão + primeira mensalidade, com os preços do plano. */
  async price(items, draft) {
    const m = md(draft);
    if (!m.planId) return items;
    const plan = await ctx().db.gymPlan.findUnique({ where: { id: m.planId } });
    if (!plan) return items;
    const linhas = [...items];
    if (D(plan.enrollmentFee).gt(0)) {
      linhas.push({ variantId: null, productId: null, kind: OrderItemKind.FEE, description: `Taxa de adesão · ${plan.name}`, quantity: D(1), unitPrice: round2(D(plan.enrollmentFee)), discount: D(0), total: round2(D(plan.enrollmentFee)), trackStock: false, metadata: { planId: plan.id } });
    }
    linhas.push({ variantId: null, productId: plan.productId, kind: OrderItemKind.SERVICE, description: `${plan.name} · 1º período`, quantity: D(1), unitPrice: round2(D(plan.price)), discount: D(0), total: round2(D(plan.price)), trackStock: false, metadata: { planId: plan.id, periodo: 1 } });
    return linhas;
  },

  async afterStatusChange(tx, order, _from, to) {
    // A matrícula nasce quando a adesão está PAGA (COMPLETED), não quando o pedido é digitado.
    if (to !== OrderStatus.COMPLETED) return;
    const full = await tx.order.findUnique({ where: { id: order.id }, include: { items: true } });
    const planId = full?.items.map((i) => (i.metadata as { planId?: string })?.planId).find(Boolean);
    if (!planId || !full?.customerId) return;
    const meta = (full.metadata as { moduleData?: GymModuleData })?.moduleData ?? {};
    await criarMatricula(tx, { customerId: full.customerId, planId, orderId: full.id, startDate: meta.startDate ? new Date(meta.startDate) : new Date(), autoRenew: meta.autoRenew ?? true, primeiraCobrancaPaga: true });
  },
};
