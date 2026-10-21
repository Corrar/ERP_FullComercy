// src/core/account/account.service.ts — A CONTA DO COMPRADOR (quem monta o ERP na loja e paga).
// Vive na PLATAFORMA (`plat_accounts`, sem tenant): existe antes de existir empresa. Usa o client
// base — é o quarto lugar onde isso é permitido (login, onboarding, jobs e esta conta).
//
// Duas sessões, dois tokens, sem mistura:
//   • token de CONTA (`typ: 'acct'`, sem `tid`): loja, carrinho, checkout, "minhas empresas".
//     O `authenticate` do tenant o recusa (não tem `tid`).
//   • sessão de TENANT (a de sempre): nasce de `enterCompany`, que confere que o usuário daquela
//     empresa pertence a esta conta. É a mesma resposta do login por senha.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { issueTenantSession } from '../auth/auth.service';
import { verifyGoogleCredential } from './google';

export const ACCOUNT_TOKEN_TYPE = 'acct';

type AccountRow = { id: string; email: string; name: string; avatarUrl: string | null; passwordHash: string | null; googleSub: string | null; trialUsedAt: Date | null };

function signAccount(accountId: string) {
  return jwt.sign({ typ: ACCOUNT_TOKEN_TYPE }, env.JWT_SECRET, { subject: accountId, expiresIn: env.ACCOUNT_TOKEN_TTL as never });
}

export const publicAccount = (a: AccountRow) => ({
  id: a.id, email: a.email, name: a.name, avatarUrl: a.avatarUrl,
  hasPassword: !!a.passwordHash, hasGoogle: !!a.googleSub,
  // A tela do carrinho diz "7 dias grátis" só para quem ainda pode ganhar.
  trialAvailable: !a.trialUsedAt,
});

async function session(a: AccountRow) {
  await prisma.account.update({ where: { id: a.id }, data: { lastLoginAt: new Date() } });
  return { token: signAccount(a.id), account: publicAccount(a) };
}

export async function register(input: { name: string; email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const exists = await prisma.account.findUnique({ where: { email } });
  if (exists) throw AppError.conflict('Já existe uma conta com este e-mail. Entre com a sua senha ou com o Google.');
  const a = await prisma.account.create({ data: { email, name: input.name.trim(), passwordHash: await bcrypt.hash(input.password, 12) } });
  return session(a);
}

export async function login(input: { email: string; password: string }) {
  const a = await prisma.account.findUnique({ where: { email: input.email.toLowerCase().trim() } });
  // Mesma mensagem para e-mail inexistente e senha errada (não se enumera conta). Conta só-Google
  // também cai aqui: não tem senha para conferir.
  if (!a || !a.passwordHash || !(await bcrypt.compare(input.password, a.passwordHash))) {
    throw new AppError('UNAUTHENTICATED', 'E-mail ou senha incorretos.');
  }
  return session(a);
}

/** Entrar (ou criar conta) com o Google. E-mail já cadastrado com senha → vincula o Google à
 *  mesma conta (o Google só devolve e-mail verificado; `google.ts` recusa o resto). */
export async function loginWithGoogle(credential: string) {
  const g = await verifyGoogleCredential(credential);
  const bySub = await prisma.account.findUnique({ where: { googleSub: g.sub } });
  if (bySub) return session(bySub);
  const byEmail = await prisma.account.findUnique({ where: { email: g.email } });
  if (byEmail) {
    if (byEmail.googleSub && byEmail.googleSub !== g.sub) throw AppError.conflict('Este e-mail já está ligado a outra conta Google.');
    const a = await prisma.account.update({ where: { id: byEmail.id }, data: { googleSub: g.sub, avatarUrl: byEmail.avatarUrl ?? g.picture } });
    return session(a);
  }
  const a = await prisma.account.create({ data: { email: g.email, name: g.name, googleSub: g.sub, avatarUrl: g.picture } });
  return session(a);
}

/** Quem sou + as empresas que esta conta abre (com o estado da assinatura de cada uma). */
export async function me(accountId: string) {
  const a = await prisma.account.findUnique({ where: { id: accountId } });
  if (!a) throw new AppError('UNAUTHENTICATED', 'Conta não encontrada. Entre de novo.');
  const users = await prisma.user.findMany({
    where: { accountId, isActive: true },
    select: {
      tenant: {
        select: {
          id: true, slug: true, name: true, status: true,
          modules: { where: { enabled: true }, select: { moduleKey: true } },
          subscription: { select: { status: true, amount: true, trialEndsAt: true, currentPeriodEnd: true, method: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return {
    account: publicAccount(a),
    companies: users.map(({ tenant: t }) => ({
      id: t.id, slug: t.slug, name: t.name, status: t.status, modules: t.modules.map((m) => m.moduleKey),
      subscription: t.subscription ? { ...t.subscription, amount: t.subscription.amount.toString() } : null,
    })),
  };
}

/** Troca o token de conta por uma sessão da empresa escolhida (o "Abrir o ERP"). */
export async function enterCompany(accountId: string, tenantId: string, meta: { ip?: string; userAgent?: string }) {
  const user = await prisma.user.findFirst({ where: { accountId, tenantId, isActive: true }, include: { tenant: true } });
  if (!user) throw AppError.forbidden('Esta empresa não pertence à sua conta.');
  return issueTenantSession(user, user.tenant, meta);
}
