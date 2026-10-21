// src/core/account/account.middleware.ts — valida o token da CONTA do comprador. Recusa token de
// tenant (sem `typ: 'acct'`), assim como o `authenticate` do tenant recusa este (sem `tid`).
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors';
import { ACCOUNT_TOKEN_TYPE } from './account.service';

export interface AccountRequest extends Request { accountId?: string }

export function authenticateAccount(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new AppError('UNAUTHENTICATED', 'Entre na sua conta para continuar.'));
  try {
    const p = jwt.verify(header.slice(7), env.JWT_SECRET) as jwt.JwtPayload;
    if (p.typ !== ACCOUNT_TOKEN_TYPE || !p.sub) throw new Error('não é token de conta');
    (req as AccountRequest).accountId = String(p.sub);
    next();
  } catch {
    next(new AppError('UNAUTHENTICATED', 'Sessão da conta expirada. Entre de novo.'));
  }
}
