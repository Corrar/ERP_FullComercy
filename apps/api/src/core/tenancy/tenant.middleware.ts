// src/core/tenancy/tenant.middleware.ts — monta o RequestContext e roda o resto da request
// dentro dele. Vem DEPOIS do `authenticate` (o tenant sai do token) e ANTES de qualquer rota
// de negócio.
import { NextFunction, Request, Response } from 'express';
import { prismaForTenant } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { loadTenantSnapshot } from './tenant-modules.service';
import { runWithContext } from './tenant-context';
import type { AuthRequest } from '../auth/auth.middleware';

export const tenantContext = buildTenantContext(false);

/** Variante das rotas de ASSINATURA (`/billing`): a empresa suspensa por falta de pagamento
 *  precisa justamente destas para pagar e voltar. Todo o resto continua fechado. */
export const tenantContextAllowSuspended = buildTenantContext(true);

function buildTenantContext(allowSuspended: boolean) {
  return async function tenantContext(req: Request, _res: Response, next: NextFunction) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return next(new AppError('UNAUTHENTICATED', 'Sessão ausente.'));

    try {
      const snap = await loadTenantSnapshot(auth.tenantId);
      if (!allowSuspended && (snap.status === 'SUSPENDED' || snap.status === 'CANCELLED')) {
        return next(new AppError('FORBIDDEN', 'Empresa suspensa. Regularize a assinatura (menu Assinatura) ou fale com o suporte.', { reason: 'TENANT_SUSPENDED' }));
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
  };
}
