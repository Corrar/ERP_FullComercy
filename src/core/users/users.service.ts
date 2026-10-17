import { ctx } from '../tenancy/tenant-context';
import { AppError } from '../../shared/errors';
import { hashPassword } from '../auth/auth.service';

export async function listUsers() {
  return ctx().db.user.findMany({
    select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true, roles: { select: { role: { select: { key: true, name: true } } } } },
    orderBy: { name: 'asc' },
  });
}

export async function createUser(input: { name: string; email: string; password: string; roleIds: string[] }) {
  const { db, tenantId } = ctx();
  return db.user.create({
    data: {
      tenantId,
      name: input.name,
      email: input.email.toLowerCase().trim(),
      passwordHash: await hashPassword(input.password),
      roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
    },
    select: { id: true, name: true, email: true },
  });
}

export async function setUserRoles(userId: string, roleIds: string[]) {
  const { db, tenantId } = ctx();
  if (!(await db.user.findUnique({ where: { id: userId } }))) throw AppError.notFound('Usuário');
  await db.$transaction([
    db.userRole.deleteMany({ where: { userId } }),
    db.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId, tenantId })) }),
  ]);
}

export async function setActive(userId: string, isActive: boolean) {
  const { db, userId: me } = ctx();
  if (userId === me && !isActive) throw AppError.validation('Você não pode desativar a própria conta.');
  return db.user.update({ where: { id: userId }, data: { isActive }, select: { id: true, isActive: true } });
}

export const updateUser = (userId: string, input: { name?: string; email?: string }) =>
  ctx().db.user.update({ where: { id: userId }, data: { ...input, email: input.email?.toLowerCase().trim() }, select: { id: true, name: true, email: true } });

/** Troca de senha pelo próprio usuário: exige a atual. Admin redefine por `resetPassword`. */
export async function changeOwnPassword(current: string, next: string) {
  const { db, userId } = ctx();
  const u = await db.user.findUnique({ where: { id: userId! } });
  if (!u) throw AppError.notFound('Usuário');
  const bcrypt = await import('bcryptjs');
  if (!(await bcrypt.compare(current, u.passwordHash))) throw AppError.validation('Senha atual incorreta.');
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  // Derruba as outras sessões: senha nova = sessões antigas morrem.
  await db.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function resetPassword(userId: string, next: string) {
  const { db } = ctx();
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function setUserPermissionExceptions(userId: string, items: { permissionKey: string; effect: 'ALLOW' | 'DENY' }[]) {
  const { db, tenantId } = ctx();
  await db.$transaction([
    db.userPermission.deleteMany({ where: { userId } }),
    db.userPermission.createMany({ data: items.map((i) => ({ ...i, userId, tenantId })) }),
  ]);
  return db.userPermission.findMany({ where: { userId } });
}
