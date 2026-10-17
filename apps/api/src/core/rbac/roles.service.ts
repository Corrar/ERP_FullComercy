import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { allPermissions, permissionExists } from './permissions';

export async function listRoles() {
  return ctx().db.role.findMany({ include: { permissions: { select: { permissionKey: true } } }, orderBy: { name: 'asc' } });
}

/** O catálogo filtrado pelos módulos ativos: a tela não oferece 'gym.*' a uma lanchonete. */
export function catalogForTenant() {
  const mods = ctx().modules;
  return allPermissions().filter((p) => p.module === null || mods.has(p.module));
}

export async function createRole(input: { key: string; name: string; permissions: string[] }) {
  validateKeys(input.permissions);
  return ctx().db.role.create({
    data: {
      tenantId: ctx().tenantId, key: input.key, name: input.name,
      permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
    },
  });
}

export async function setRolePermissions(roleId: string, permissions: string[]) {
  validateKeys(permissions);
  const { db, tenantId } = ctx();
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) throw AppError.notFound('Perfil');
  if (role.isSystem) throw AppError.forbidden('Perfil de sistema não é editável.');
  await tenantTransaction(db, tenantId, async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({ data: permissions.map((permissionKey) => ({ roleId, permissionKey, tenantId })) });
  });
  return db.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
}

function validateKeys(keys: string[]) {
  const bad = keys.filter((k) => !permissionExists(k));
  if (bad.length) throw AppError.validation(`Permissões desconhecidas: ${bad.join(', ')}`);
}
