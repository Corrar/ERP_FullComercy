// src/shared/request-log.ts — id de requisição + uma linha de log por request (método, rota,
// status, duração, tenant, usuário). `X-Request-Id` volta ao cliente para o suporte cruzar com o log.
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthRequest } from '../core/auth/auth.middleware';

export function requestLog(req: Request, res: Response, next: NextFunction) {
  const id = String(req.get('x-request-id') ?? randomUUID());
  res.setHeader('x-request-id', id);
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/health' || req.path === '/health/ready') return;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const a = (req as AuthRequest).auth;
    const linha = { t: new Date().toISOString(), id, m: req.method, p: req.originalUrl.split('?')[0], s: res.statusCode, ms: Math.round(ms), tid: a?.tenantId?.slice(0, 8), uid: a?.userId?.slice(0, 8), ip: req.ip };
    (res.statusCode >= 500 ? console.error : console.log)(JSON.stringify(linha));
  });
  next();
}
