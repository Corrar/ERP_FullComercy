// src/core/rbac/rbac.service.ts — "o que esta pessoa pode", calculado num lugar só.
// Login, GET /auth/me e o gate `requirePermission` chamam ESTA função. Uma cópia da regra em
// cada lugar é uma divergência esperando acontecer (lição do PERM-CARGO do Fluxo).
import { PermissionEffect } from '@prisma/client';
import { prisma } from '../../infra/prisma';
import { SYSTEM_ROLES } from './permissions';
import { loadTenantSnapshot } from '../tenancy/tenant-modules.service';

export interface EffectiveAccess {
  exists: boolean;
  isAdmin: boolean;
  keys: Set<string>;
  /** O que o plano da empresa libera (`null` = sem assinatura, nada cortado). */
  plan: Set<string> | null;
}

/** A pergunta única "esta pessoa pode `key`?": o PLANO corta primeiro (nem o admin usa o que a
 *  empresa não contratou), depois vale o perfil. */
export function canUse(acc: EffectiveAccess, key: string): boolean {
  if (acc.plan && !acc.plan.has(key)) return false;
  return acc.isAdmin || acc.keys.has(key);
}

/** Lista que o front recebe em `permissions`: `['*']` só para admin SEM plano; com plano, o
 *  admin recebe as chaves do plano por extenso (o `*` mostraria menu do que não foi pago). */
export function visiblePermissions(acc: EffectiveAccess): string[] {
  if (acc.isAdmin) return acc.plan ? [...acc.plan] : ['*'];
  return [...acc.keys].filter((k) => !acc.plan || acc.plan.has(k));
}

/**
 * Precedência, da mais forte para a mais fraca:
 *   1. perfil `admin` (isSystem) → tudo, sem consultar matriz;
 *   2. exceção individual DENY → remove a chave mesmo que algum perfil dê;
 *   3. união das chaves de todos os perfis do usuário + exceções ALLOW.
 * Usa o client base com `tenantId` explícito porque o login chama antes do contexto existir.
 */
export async function effectivePermissions(tenantId: string, userId: string): Promise<EffectiveAccess> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true,
      roles: { select: { role: { select: { key: true, isSystem: true, permissions: { select: { permissionKey: true } } } } } },
      permissions: { select: { permissionKey: true, effect: true } },
    },
  });
  if (!user) return { exists: false, isAdmin: false, keys: new Set(), plan: null };

  const isAdmin = user.roles.some((r) => r.role.isSystem && r.role.key === SYSTEM_ROLES.ADMIN);
  const keys = new Set<string>();
  for (const r of user.roles) for (const p of r.role.permissions) keys.add(p.permissionKey);
  for (const p of user.permissions) {
    if (p.effect === PermissionEffect.ALLOW) keys.add(p.permissionKey);
  }
  for (const p of user.permissions) {
    if (p.effect === PermissionEffect.DENY) keys.delete(p.permissionKey);
  }
  const { planKeys } = await loadTenantSnapshot(tenantId);
  return { exists: true, isAdmin, keys, plan: planKeys };
}
