// src/core/rbac/rbac.middleware.ts — o guardião granular. Lê do BANCO a cada request (nunca da
// claim do token): rebaixar alguém vale na request seguinte, não quando o token expirar.
import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../shared/errors';
import type { AuthRequest } from '../auth/auth.middleware';
import { canUse, effectivePermissions } from './rbac.service';
import { permissionExists } from './permissions';

/** Chaves que ALGUMA rota realmente cobra — preenchido no boot, pelo próprio uso. */
export const KEYS_REQUIRED_BY_ROUTES = new Set<string>();

export function requirePermission(key: string) {
  KEYS_REQUIRED_BY_ROUTES.add(key);
  const guard = async (req: Request, _res: Response, next: NextFunction) => {
    const a = (req as AuthRequest).auth;
    if (!a) return next(new AppError('UNAUTHENTICATED', 'Sessão ausente.'));
    try {
      const acc = await effectivePermissions(a.tenantId, a.userId);
      if (!acc.exists) return next(new AppError('FORBIDDEN', 'Perfil não encontrado para este usuário.'));
      if (canUse(acc, key)) return next();
      if (acc.plan && !acc.plan.has(key)) {
        return next(new AppError('FORBIDDEN', 'Esta função não faz parte do plano da sua empresa. Adicione-a em Assinatura.', { permission: key, reason: 'NOT_IN_PLAN' }));
      }
      return next(new AppError('FORBIDDEN', `Sem permissão para esta operação (${key}).`));
    } catch (e) {
      next(e);
    }
  };
  // Para o gerador de docs/API.md ler a chave de cada rota sem executar nada.
  (guard as unknown as { permissionKey: string }).permissionKey = key;
  return guard;
}

/** Falha ALTO no boot se uma rota cobrar chave que ninguém declarou: evita a "chave órfã"
 *  que ninguém consegue conceder pela tela. Chamar depois de montar todos os routers. */
export function assertAllRequiredKeysAreDeclared() {
  const orphans = [...KEYS_REQUIRED_BY_ROUTES].filter((k) => !permissionExists(k));
  if (orphans.length) throw new Error(`Rotas cobram permissões fora do catálogo: ${orphans.join(', ')}`);
}
