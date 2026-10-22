// src/shared/events.ts — barramento de eventos EM PROCESSO. Desacopla "aconteceu" de "quem
// reage": o core emite `order.completed`; o Varejo calcula comissão, o tempo real avisa a tela,
// a auditoria registra. Nenhum deles importa o outro.
// ⚠ É em memória: não sobrevive a restart nem atravessa instâncias. Quem precisar de garantia
//   (integração externa) usa outbox em tabela, como o PROT1 do Fluxo — fora deste lote.
import { EventEmitter } from 'node:events';

export interface DomainEvents {
  'order.created':   { tenantId: string; orderId: string; moduleKey: string | null; total: string };
  'order.status':    { tenantId: string; orderId: string; from: string; to: string };
  'order.paid':      { tenantId: string; orderId: string; amount: string };
  'stock.low':       { tenantId: string; variantId: string; warehouseId: string; onHand: string; minLevel: string };
  'kitchen.ticket':  { tenantId: string; ticketId: string; station: string; status: string; orderId?: string };
  'delivery.status': { tenantId: string; deliveryId: string; status: string; orderId?: string };
  'gym.access':      { tenantId: string; customerId: string | null; allowed: boolean; reason: string };
  'os.status':       { tenantId: string; serviceOrderId: string; status: string };
  'purchase.received': { tenantId: string; purchaseOrderId: string; number: number; total: string };
  'payment.paid':    { tenantId: string; intentId: string; orderId: string | null; amount: string; provider: string };
}

class TypedBus {
  private readonly em = new EventEmitter({ captureRejections: true });
  constructor() { this.em.setMaxListeners(50); this.em.on('error', (e) => console.error('[events] listener falhou:', e)); }
  on<K extends keyof DomainEvents>(event: K, fn: (p: DomainEvents[K]) => unknown) { this.em.on(event, fn as (p: DomainEvents[K]) => void); return this; }
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    // setImmediate: o emissor nunca espera os ouvintes, e um ouvinte lento não segura a response.
    setImmediate(() => this.em.emit(event, payload));
  }
}

export const events = new TypedBus();
