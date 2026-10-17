// modules/food/services/food-sales.strategy.ts — como o FOOD vende.
// Pedido nasce OPEN (vai para a cozinha), NÃO mexe em estoque na criação (insumo baixa por
// ficha técnica quando a cozinha confirma — fora deste lote), e NÃO fecha ao pagar sozinho
// quando está numa comanda: quem fecha é o fechamento da conta. Delivery/takeout sem comanda
// fecha ao pagar, como um PDV.
import { FoodServiceType, ModuleKey, OrderChannel, OrderStatus } from '@prisma/client';
import type { SalesStrategy, OrderDraft } from '../../../core/orders/sales-strategy';
import { ctx, moduleConfig } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';
import { D, round2 } from '../../../shared/money';
import { abrirTicketsDeCozinha } from './cozinha.service';
import { criarEntrega } from './entregadores.service';

interface FoodModuleData {
  serviceType?: FoodServiceType;
  tableId?: string;
  tabId?: string;
  menuId?: string;
  address?: Record<string, unknown>;
  zoneId?: string;
  scheduledFor?: string;
  externalSource?: string;
  externalId?: string;
}
interface FoodConfig { taxaServicoPadrao?: number; baixarInsumoNaCriacao?: boolean }

const md = (d: OrderDraft) => (d.moduleData ?? {}) as FoodModuleData;
const tipo = (d: OrderDraft): FoodServiceType =>
  md(d).serviceType ?? (d.channel === OrderChannel.DELIVERY ? 'DELIVERY' : d.channel === OrderChannel.TABLE ? 'DINE_IN' : 'TAKEOUT');

export const foodSalesStrategy: SalesStrategy = {
  moduleKey: ModuleKey.FOOD,
  name: 'Food & Delivery',
  channels: [OrderChannel.TABLE, OrderChannel.DELIVERY, OrderChannel.ONLINE, OrderChannel.COUNTER],

  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => (moduleConfig<FoodConfig>(ModuleKey.FOOD).baixarInsumoNaCriacao ? 'CONSUME' : 'NONE'),
  // Em comanda, o pagamento acontece no fechamento da conta, não por pedido.
  completeOnFullPayment: (d) => !md(d).tabId,

  async validate(draft) {
    const m = md(draft);
    const t = tipo(draft);
    const { db } = ctx();
    if (t === 'DINE_IN' && !m.tableId && !m.tabId) throw AppError.validation('Pedido de salão exige mesa ou comanda.');
    if (m.tableId) {
      const mesa = await db.foodTable.findUnique({ where: { id: m.tableId } });
      if (!mesa?.isActive) throw AppError.notFound('Mesa');
    }
    if (m.tabId) {
      const tab = await db.foodTab.findUnique({ where: { id: m.tabId } });
      if (!tab || tab.status !== 'OPEN') throw AppError.conflict('Comanda fechada ou inexistente.');
    }
    if (t === 'DELIVERY' && !m.address) throw AppError.validation('Delivery exige endereço (moduleData.address).');
  },

  /** O cardápio manda no preço: se o item está num menu, vale o preço do menu, não o de tabela. */
  async price(items, draft) {
    const m = md(draft);
    if (!m.menuId) return items;
    const { db } = ctx();
    const menuItems = await db.foodMenuItem.findMany({ where: { menuId: m.menuId, isAvailable: true } });
    const byVariant = new Map(menuItems.map((mi) => [mi.variantId, mi]));
    return items.map((it) => {
      const mi = it.variantId ? byVariant.get(it.variantId) : undefined;
      if (!mi) return it;
      // Adicionais escolhidos chegam em metadata.modifiers = [{ name, price }].
      const extras = ((it.metadata.modifiers as { price?: number }[] | undefined) ?? []).reduce((s, x) => s.plus(D(x.price ?? 0)), D(0));
      const unitPrice = round2(D(mi.price).plus(extras));
      return { ...it, description: mi.displayName, unitPrice, total: round2(unitPrice.mul(it.quantity).minus(it.discount)), metadata: { ...it.metadata, station: mi.station, menuItemId: mi.id } };
    });
  },

  async afterCreate(tx, order, items, draft) {
    const m = md(draft);
    const t = tipo(draft);
    const food = await tx.foodOrder.create({
      data: {
        tenantId: order.tenantId, orderId: order.id, serviceType: t,
        tableId: m.tableId ?? null, tabId: m.tabId ?? null,
        scheduledFor: m.scheduledFor ? new Date(m.scheduledFor) : null,
        externalSource: m.externalSource ?? null, externalId: m.externalId ?? null,
      },
    });
    if (m.tableId) await tx.foodTable.update({ where: { id: m.tableId }, data: { status: 'OCCUPIED' } });
    await abrirTicketsDeCozinha(tx, food.id, order, items);
    if (t === 'DELIVERY') await criarEntrega(tx, food.id, m.address!, m.zoneId);
  },

  /** Nova rodada na mesma comanda/pedido: só os itens novos viram tickets. */
  async afterItemsAdded(tx, order, newItems, newRows) {
    const food = await tx.foodOrder.findFirst({ where: { orderId: order.id } });
    if (!food) return;
    await abrirTicketsDeCozinha(tx, food.id, { ...order, items: newRows.map((r) => ({ id: r.id, variantId: null, quantity: D(0), kind: 'PRODUCT' as const })) }, newItems);
  },

  async afterStatusChange(tx, order, _from, to) {
    if (to === OrderStatus.CANCELLED) {
      await tx.foodOrder.updateMany({ where: { orderId: order.id }, data: { kitchenStatus: 'CANCELLED' } });
      await tx.foodKitchenTicket.updateMany({ where: { foodOrder: { orderId: order.id } }, data: { status: 'CANCELLED' } });
    }
  },
};
