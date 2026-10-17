// src/shared/audit-http.ts — auditoria GENÉRICA de mutação HTTP (opt-in: AUDIT_HTTP=1).
// Complementa as auditorias de negócio (order.create, retail.return…) com "quem chamou o quê":
// método, rota, status e o corpo SEM campos sensíveis. Grava fora do caminho crítico (não espera).
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ctx } from '../core/tenancy/tenant-context';

const SENSIVEIS = /pass|senha|secret|token|hash/i;
const limpa = (v: unknown, prof = 0): unknown => {
  if (prof > 3 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => limpa(x, prof + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SENSIVEIS.test(k) ? '***' : limpa(x, prof + 1)]));
};

export function auditHttp(req: Request, res: Response, next: NextFunction) {
  if (!env.AUDIT_HTTP || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  let c: ReturnType<typeof ctx> | null = null;
  try { c = ctx(); } catch { return next(); }
  res.on('finish', () => {
    if (res.statusCode >= 400 || !c) return;
    void c.db.auditLog.create({ data: { tenantId: c.tenantId, userId: c.userId, action: `http.${req.method.toLowerCase()}`, entity: req.baseUrl + (req.route?.path ?? req.path), entityId: String(req.params?.id ?? ''), ip: req.ip, details: { status: res.statusCode, body: limpa(req.body) } as never } }).catch(() => undefined);
  });
  next();
}
