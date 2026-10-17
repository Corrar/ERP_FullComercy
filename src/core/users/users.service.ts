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
