// src/infra/realtime.ts — Socket.IO com UMA sala por tenant. O cliente conecta com o mesmo JWT
// da API; a sala é derivada do token, nunca do que o cliente pede — empresa A não entra na sala
// da B nem mandando `join`. Quem emite é o barramento de eventos (events.ts), não os services.
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { events } from '../shared/events';
import { lerAcompanhamento } from '../shared/track-token';

let io: Server | null = null;

export function initRealtime(http: HttpServer, allowed: (origin: string) => boolean) {
  // Mesma regra do CORS HTTP (app.ts → originAllowed), curingas de preview inclusos.
  io = new Server(http, { cors: { origin: (o, cb) => cb(null, !o || allowed(o)), credentials: true } });

  io.use((socket, next) => {
    // Cliente final acompanhando UM pedido (sem login): só a sala daquele pedido, nada do tenant.
    const track = socket.handshake.auth?.track as string | undefined;
    if (track) {
      const t = lerAcompanhamento(track);
      if (!t) return next(new Error('token inválido'));
      socket.data.trackOrderId = t.orderId;
      return next();
    }
    const token = (socket.handshake.auth?.token as string | undefined) ?? socket.handshake.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return next(new Error('sem token'));
    try {
      const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
      socket.data.tenantId = String(p.tid); socket.data.userId = String(p.sub);
      next();
    } catch { next(new Error('token inválido')); }
  });

  io.on('connection', (socket) => {
    if (socket.data.trackOrderId) { socket.join(`track:${socket.data.trackOrderId}`); return; }
    socket.join(`tenant:${socket.data.tenantId}`);
    socket.join(`user:${socket.data.userId}`);
    // Sub-salas opcionais por tela (KDS por estação, painel de entregas). Sempre prefixadas pelo tenant.
    socket.on('subscribe', (topic: unknown) => {
      if (typeof topic === 'string' && /^[a-z0-9:_-]{1,60}$/i.test(topic)) socket.join(`tenant:${socket.data.tenantId}:${topic}`);
    });
  });

  // Ponte eventos → sala do tenant. Payload já é seguro para a tela (ids e status, sem segredo).
  events.on('order.created',   (p) => emitToTenant(p.tenantId, 'order.created', p));
  events.on('order.status',    (p) => emitToTenant(p.tenantId, 'order.status', p));
  events.on('order.paid',      (p) => emitToTenant(p.tenantId, 'order.paid', p));
  events.on('stock.low',       (p) => emitToTenant(p.tenantId, 'stock.low', p));
  events.on('kitchen.ticket',  (p) => { emitToTenant(p.tenantId, 'kitchen.ticket', p); emitToTenant(p.tenantId, 'kitchen.ticket', p, `kds:${p.station}`); });
  events.on('delivery.status', (p) => emitToTenant(p.tenantId, 'delivery.status', p));
  events.on('gym.access',      (p) => emitToTenant(p.tenantId, 'gym.access', p));
  events.on('os.status',       (p) => emitToTenant(p.tenantId, 'os.status', p));
  events.on('payment.paid',    (p) => emitToTenant(p.tenantId, 'payment.paid', p));
  // Acompanhamento público: só o aviso "mudou" (a página relê pelo GET que exige o telefone).
  const avisar = (orderId?: string | null) => { if (orderId) io?.to(`track:${orderId}`).emit('track.update', { orderId }); };
  events.on('order.status', (p) => avisar(p.orderId));
  events.on('order.paid', (p) => avisar(p.orderId));
  events.on('kitchen.ticket', (p) => avisar(p.orderId));
  events.on('delivery.status', (p) => avisar(p.orderId));
  console.log('[realtime] Socket.IO ligado');
  return io;
}

export function emitToTenant(tenantId: string, event: string, payload: unknown, topic?: string) {
  io?.to(topic ? `tenant:${tenantId}:${topic}` : `tenant:${tenantId}`).emit(event, payload);
}
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
