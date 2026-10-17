// modules/food/services/pedido-online.service.ts — o PEDIDO DO CLIENTE FINAL pelo cardápio
// online, SEM login. Roda como o tenant (runAsTenantSlug), cria/acha o cliente pelo telefone e
// entra pela MESMA porta de todo pedido: createOrder com a estratégia do Food.
// Pagamento: na entrega/retirada (o título fica em aberto). Pagamento online é integração futura.
import { ctx } from '../../../core/tenancy/tenant-context';
import { runAsTenantSlug } from '../../../core/tenancy/run-as-tenant';
import { AppError } from '../../../shared/errors';
import * as orders from '../../../core/orders/order.service';
import { abertoAgora } from './cardapio.service';

export interface PedidoOnlineInput {
  menuSlug: string;
  serviceType: 'DELIVERY' | 'TAKEOUT';
  cliente: { nome: string; telefone: string };
  endereco?: { street: string; number?: string; complement?: string; district?: string; city: string; state: string; zipCode?: string; reference?: string };
  zoneId?: string;
  itens: { menuItemId: string; quantity: number; modifiers?: { name: string; price: number }[]; obs?: string }[];
  observacoes?: string;
  pagamentoNaEntrega: 'CASH' | 'DEBIT' | 'CREDIT' | 'PIX';
  trocoPara?: number;
}

export function pedidoOnline(tenantSlug: string, input: PedidoOnlineInput) {
  return runAsTenantSlug(tenantSlug, async () => {
    const { db } = ctx();
    const menu = await db.foodMenu.findFirst({ where: { slug: input.menuSlug, isPublished: true } });
    if (!menu) throw AppError.notFound('Cardápio');
    if (!abertoAgora(menu.availability as never)) throw AppError.conflict('A loja está fechada agora.');
    if (input.serviceType === 'DELIVERY' && !input.endereco) throw AppError.validation('Delivery exige endereço.');

    const telefone = input.cliente.telefone.replace(/\D/g, '');
    const cliente = await db.customer.findFirst({ where: { phone: telefone } })
      ?? await db.customer.create({ data: { tenantId: ctx().tenantId, name: input.cliente.nome, phone: telefone, tags: ['online'] } });
    if (input.endereco) {
      const existe = await db.customerAddress.findFirst({ where: { customerId: cliente.id, street: input.endereco.street, number: input.endereco.number ?? null } });
      if (!existe) await db.customerAddress.create({ data: { tenantId: ctx().tenantId, customerId: cliente.id, ...input.endereco, isDefault: true } });
    }

    const menuItems = await db.foodMenuItem.findMany({ where: { menuId: menu.id, id: { in: input.itens.map((i) => i.menuItemId) }, isAvailable: true } });
    const items = input.itens.map((i) => {
      const mi = menuItems.find((m) => m.id === i.menuItemId);
      if (!mi) throw AppError.notFound('Item do cardápio');
      return { variantId: mi.variantId, quantity: i.quantity, metadata: { modifiers: i.modifiers ?? [], obs: i.obs ?? null } };
    });
    const zona = input.zoneId ? await db.foodDeliveryZone.findUnique({ where: { id: input.zoneId } }) : null;

    return orders.createOrder({
      moduleKey: 'FOOD', channel: 'ONLINE', customerId: cliente.id, items,
      surcharge: input.serviceType === 'DELIVERY' ? Number(zona?.fee ?? 0) : 0,
      notes: [input.observacoes, input.trocoPara ? `Troco para R$ ${input.trocoPara}` : null].filter(Boolean).join(' · ') || null,
      metadata: { pagamentoNaEntrega: input.pagamentoNaEntrega, origem: 'cardapio-online' },
      moduleData: { serviceType: input.serviceType, menuId: menu.id, address: input.endereco, zoneId: input.zoneId, externalSource: 'SITE' },
    });
  });
}

/** Acompanhamento público: status do pedido pelo número + telefone (sem expor outros dados). */
export function acompanharPedido(tenantSlug: string, numero: number, telefone: string) {
  return runAsTenantSlug(tenantSlug, async () => {
    const o = await ctx().db.order.findFirst({ where: { number: numero, customer: { phone: telefone.replace(/\D/g, '') } }, include: { foodOrder: { include: { delivery: { select: { status: true, courier: { select: { name: true } } } } } } } });
    if (!o) throw AppError.notFound('Pedido');
    return { numero: o.number, status: o.status, cozinha: o.foodOrder?.kitchenStatus, entrega: o.foodOrder?.delivery ?? null, total: o.total, criadoEm: o.createdAt };
  });
}
