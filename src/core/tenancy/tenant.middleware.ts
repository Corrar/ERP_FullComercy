// src/core/tenancy/tenant.middleware.ts — monta o RequestContext e roda o resto da request
// dentro dele. Vem DEPOIS do `authenticate` (o tenant sai do token) e ANTES de qualquer rota
// de negócio.
import { NextFunction, Request, Response } from 'express';
import { prismaForTenant } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { loadTenantSnapshot } from './tenant-modules.service';
import { runWithContext } from './tenant-context';
import type { AuthRequest } from '../auth/auth.middleware';

export async function tenantContext(req: Request, _res: Response, next: NextFunction) {
  const auth = (req as AuthRequest).auth;
  if (!auth) return next(new AppError('UNAUTHENTICATED', 'Sessão ausente.'));

  try {
    const snap = await loadTenantSnapshot(auth.tenantId);
    if (snap.status === 'SUSPENDED' || snap.status === 'CANCELLED') {
      return next(new AppError('FORBIDDEN', 'Empresa suspensa. Fale com o suporte.'));
    }
    runWithContext(
      {
        tenantId: snap.id,
        tenantSlug: snap.slug,
        tenantSettings: snap.settings,
        modules: snap.modules,
        userId: auth.userId,
        db: prismaForTenant(snap.id),
        ip: req.ip,
      },
      () => next(),
    );
  } catch (e) {
    next(e);
  }
}
