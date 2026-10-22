// src/shared/track-token.ts — token de ACOMPANHAMENTO de um pedido, para o cliente final sem login.
// Só sai de quem já provou número + telefone (GET público do acompanhamento) e só abre a sala
// daquele pedido no Socket.IO. Chave DERIVADA do JWT_SECRET: um token de acompanhamento não vale
// como login da API, e um token de login não abre sala de acompanhamento.
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const chave = () => createHmac('sha256', env.JWT_SECRET).update('fc-track-v1').digest();

export const assinarAcompanhamento = (tenantId: string, orderId: string) =>
  jwt.sign({ tid: tenantId, oid: orderId }, chave(), { expiresIn: '12h', audience: 'track' });

export function lerAcompanhamento(token: string): { tenantId: string; orderId: string } | null {
  try {
    const p = jwt.verify(token, chave(), { audience: 'track' }) as jwt.JwtPayload;
    return typeof p.oid === 'string' && typeof p.tid === 'string' ? { tenantId: p.tid, orderId: p.oid } : null;
  } catch { return null; }
}

// ── Link de PAGAMENTO (página pública /pagar/<token>) ─────────────────────────────────────────
// Mesmo cuidado: chave derivada própria e audiência própria. Abre só a página daquela cobrança
// (valor, Pix, situação) — nem o pedido inteiro, nem nada da empresa além do nome e da marca.
const chavePagamento = () => createHmac('sha256', env.JWT_SECRET).update('fc-pay-v1').digest();

export const assinarPagamento = (tenantId: string, intentId: string) =>
  jwt.sign({ tid: tenantId, iid: intentId }, chavePagamento(), { expiresIn: '30d', audience: 'pay' });

export function lerPagamento(token: string): { tenantId: string; intentId: string } | null {
  try {
    const p = jwt.verify(token, chavePagamento(), { audience: 'pay' }) as jwt.JwtPayload;
    return typeof p.iid === 'string' && typeof p.tid === 'string' ? { tenantId: p.tid, intentId: p.iid } : null;
  } catch { return null; }
}
