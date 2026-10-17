// src/core/auth/auth.service.ts — login, refresh e logout.
// Roda ANTES de existir contexto de tenant (é o login que descobre o tenant), por isso usa o
// client base e filtra `tenantId` à mão — é um dos três lugares onde isso é permitido.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { prisma } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { effectivePermissions } from '../rbac/rbac.service';
import { loadTenantSnapshot } from '../tenancy/tenant-modules.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function signAccess(userId: string, tenantId: string) {
  return jwt.sign({ tid: tenantId }, env.JWT_SECRET, { subject: userId, expiresIn: env.JWT_ACCESS_TTL as never });
}

async function issueRefresh(userId: string, tenantId: string, meta: { ip?: string; userAgent?: string }) {
  const raw = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({
    data: { tenantId, userId, tokenHash: sha256(raw), expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });
  return raw;
}

export interface LoginInput {
  tenantSlug: string;
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export async function login(input: LoginInput) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: input.tenantSlug } });
  // Mesma mensagem para tenant inexistente, e-mail errado e senha errada: não se enumera conta.
  const invalid = () => new AppError('UNAUTHENTICATED', 'Credenciais inválidas.');
  if (!tenant) throw invalid();

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: input.email.toLowerCase().trim() } },
  });
  if (!user || !user.isActive) throw invalid();
  if (!(await bcrypt.compare(input.password, user.passwordHash))) throw invalid();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const [perms, snap] = await Promise.all([effectivePermissions(tenant.id, user.id), loadTenantSnapshot(tenant.id)]);

  return {
    accessToken: signAccess(user.id, tenant.id),
    refreshToken: await issueRefresh(user.id, tenant.id, input),
    user: { id: user.id, name: user.name, email: user.email },
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    // O front desenha o menu com isto: permissões efetivas + módulos ligados.
    permissions: perms.isAdmin ? ['*'] : [...perms.keys],
    modules: [...snap.modules.keys()],
  };
}

export async function refresh(rawToken: string, meta: { ip?: string; userAgent?: string }) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    throw new AppError('UNAUTHENTICATED', 'Sessão expirada. Faça login novamente.');
  }
  // Rotação: o antigo morre, nasce um novo. Reuso do antigo = sinal de roubo -> revoga família.
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return {
    accessToken: signAccess(row.userId, row.tenantId),
    refreshToken: await issueRefresh(row.userId, row.tenantId, meta),
  };
}

export async function logout(rawToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

// ── Esqueci a senha / convite ─────────────────────────────────────────────────────────────
import { sendMail, appUrl } from '../../infra/mailer';

/** Gera o token de uso único (1 h) e devolve o CRU para ir no link. Invalida os anteriores. */
export async function issuePasswordToken(tenantId: string, userId: string, purpose: 'RESET' | 'INVITE') {
  const raw = randomBytes(32).toString('base64url');
  await prisma.passwordReset.updateMany({ where: { tenantId, userId, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.passwordReset.create({ data: { tenantId, userId, tokenHash: sha256(raw), purpose, expiresAt: new Date(Date.now() + (purpose === 'INVITE' ? 72 : 1) * 3_600_000) } });
  return raw;
}

/** SEMPRE responde igual (quem pediu não descobre se o e-mail existe). */
export async function forgotPassword(tenantSlug: string, email: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  const user = tenant ? await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase().trim() } } }) : null;
  if (!tenant || !user || !user.isActive) return;
  const token = await issuePasswordToken(tenant.id, user.id, 'RESET');
  const link = appUrl(`/redefinir-senha?tenant=${encodeURIComponent(tenant.slug)}&token=${token}`);
  await sendMail({ to: user.email, subject: `${tenant.name} · redefinição de senha`, text: `Olá, ${user.name}.

Para redefinir sua senha, abra o link (vale por 1 hora):
${link}

Se não foi você, ignore este e-mail.` });
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Link inválido ou expirado. Peça um novo.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(newPassword), isActive: true } }),
    prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    // Senha nova = sessões antigas morrem.
    prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { userId: row.userId, purpose: row.purpose };
}
