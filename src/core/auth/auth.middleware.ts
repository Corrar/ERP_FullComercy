// src/core/auth/auth.middleware.ts — valida o JWT e confere, NO BANCO, que a conta segue ativa.
// Herda a lição do Fluxo (FURO 12): `is_active` só no login deixa um token vivo de conta
// suspensa passar por até 1 dia. Aqui a checagem é por request, fail-closed.
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../infra/prisma';
import { AppError } from '../../shared/errors';

export interface AuthClaims {
  /** `sub` do JWT. */
  userId: string;
  tenantId: string;
}

export interface AuthRequest extends Request {
  auth?: AuthClaims;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHENTICATED', 'Token de autenticação não fornecido.'));
  }
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return next(new AppError('UNAUTHENTICATED', 'Token inválido ou expirado. Faça login novamente.'));
  }
  const userId = String(payload.sub ?? '');
  const tenantId = String(payload.tid ?? '');
  if (!userId || !tenantId) {
    return next(new AppError('UNAUTHENTICATED', 'Token sem identidade.'));
  }

  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, tenantId: true } });
    if (!u || u.tenantId !== tenantId) {
      return next(new AppError('UNAUTHENTICATED', 'Sessão não corresponde a um usuário válido.'));
    }
    if (!u.isActive) return next(new AppError('FORBIDDEN', 'Conta suspensa.'));
  } catch {
    // Sem banco não dá para afirmar que a conta está ativa: fecha.
    return next(new AppError('INTERNAL', 'Erro ao validar a sessão.'));
  }

  (req as AuthRequest).auth = { userId, tenantId };
  next();
}
