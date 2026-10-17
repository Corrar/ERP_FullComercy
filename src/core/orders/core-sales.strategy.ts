// src/core/orders/core-sales.strategy.ts — a venda SIMPLES: empresa sem módulo de venda ativo
// (ou módulo ativo que não vende). Balcão: nasce aberta, consome estoque, fecha ao pagar.
import { OrderChannel, OrderStatus } from '@prisma/client';
import type { SalesStrategy } from './sales-strategy';

export const coreSalesStrategy: SalesStrategy = {
  moduleKey: null,
  name: 'Venda simples (core)',
  channels: [OrderChannel.COUNTER, OrderChannel.POS],
  initialStatus: () => OrderStatus.OPEN,
  stockPolicy: () => 'CONSUME',
  completeOnFullPayment: () => true,
};
