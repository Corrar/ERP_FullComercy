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
import { createHash, randomBytes } from 'node:crypto';
import { appUrl, sendMail } from '../../infra/mailer';
import { emailDaEmpresa, marcaDaPlataforma } from '../../infra/mail-templates';
import { enviarBoasVindas } from '../billing/boas-vindas';
import { invoiceView } from '../billing/billing.service';

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

// ── Esqueci a senha da CONTA ─────────────────────────────────────────────────────────────
// Token de uso único (1 h), só o hash no banco; resposta sempre igual (não revela se o e-mail
// existe). Vale também para conta só-Google: é como ela ganha uma senha.
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function forgotAccountPassword(email: string) {
  const a = await prisma.account.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!a) return;
  const raw = randomBytes(32).toString('base64url');
  await prisma.accountPasswordReset.updateMany({ where: { accountId: a.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.accountPasswordReset.create({ data: { accountId: a.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3_600_000) } });
  const marca = marcaDaPlataforma();
  await sendMail({ to: a.email, subject: `${marca.nome} · redefinir a senha da sua conta`, ...emailDaEmpresa({
    marca, titulo: `Olá, ${a.name}`,
    paragrafos: [a.passwordHash
      ? 'Recebemos um pedido para redefinir a senha da sua conta (a da loja e da área Minha conta). O link vale por 1 hora e só funciona uma vez.'
      : 'Você entra com o Google. Pelo link abaixo você cria também uma senha para a sua conta (vale por 1 hora e só funciona uma vez).'],
    botao: { texto: 'Redefinir minha senha', url: appUrl(`/conta/redefinir-senha?token=${raw}`) },
    nota: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
  }) });
}

/** Troca a senha da conta. Os usuários das empresas desta conta que ainda entram com a senha da
 *  conta (herdada no checkout) passam a usar a nova — e as sessões deles caem; quem definiu uma
 *  senha própria no sistema continua com a dela. */
export async function resetAccountPassword(rawToken: string, password: string) {
  const row = await prisma.accountPasswordReset.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { account: true } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Link inválido ou expirado. Peça um novo.');
  const a = row.account; const novo = await bcrypt.hash(password, 12);
  const herdaram = a.passwordHash ? await prisma.user.findMany({ where: { accountId: a.id, passwordHash: a.passwordHash }, select: { id: true } }) : [];
  await prisma.$transaction([
    prisma.accountPasswordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.account.update({ where: { id: a.id }, data: { passwordHash: novo } }),
    prisma.user.updateMany({ where: { id: { in: herdaram.map((u) => u.id) } }, data: { passwordHash: novo } }),
    prisma.refreshToken.updateMany({ where: { userId: { in: herdaram.map((u) => u.id) }, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { ok: true, empresasAtualizadas: herdaram.length };
}

// ── Minhas empresas: dados de acesso e assinatura ───────────────────────────────────────
async function minhaEmpresa(accountId: string, tenantId: string) {
  const user = await prisma.user.findFirst({ where: { accountId, tenantId, isActive: true }, include: { tenant: { include: { modules: { where: { enabled: true }, select: { moduleKey: true } } } } } });
  if (!user) throw AppError.forbidden('Esta empresa não pertence à sua conta.');
  return user;
}

/** Reenvia o e-mail com os dados de acesso (e um link novo de senha; o anterior deixa de valer). */
export async function reenviarDadosDeAcesso(accountId: string, tenantId: string) {
  const user = await minhaEmpresa(accountId, tenantId);
  const a = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const sub = await prisma.subscription.findUnique({ where: { tenantId }, include: { items: true } });
  const enviado = await enviarBoasVindas({
    tenantId, slug: user.tenant.slug, adminUserId: user.id, nome: a.name, email: user.email, temSenha: !!a.passwordHash,
    modulos: user.tenant.modules.map((m) => m.moduleKey), funcoes: sub?.items.map((i) => i.label) ?? [],
    total: sub?.amount.toFixed(2) ?? '0', trialAte: sub?.status === 'TRIALING' ? sub.trialEndsAt : null,
  });
  if (!enviado) throw new AppError('INTERNAL', 'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.');
  return { enviadoPara: user.email };
}

/** Plano, próxima cobrança e faturas de uma empresa — só para a conta que paga a assinatura. */
export async function assinaturaDaEmpresa(accountId: string, tenantId: string) {
  await minhaEmpresa(accountId, tenantId);
  const sub = await prisma.subscription.findUnique({ where: { tenantId }, include: { items: { orderBy: { price: 'desc' } } } });
  if (!sub) return null;
  if (sub.accountId !== accountId) throw AppError.forbidden('Só quem paga a assinatura vê as faturas.');
  const faturas = await prisma.invoice.findMany({ where: { tenantId, subscriptionId: sub.id }, orderBy: { createdAt: 'desc' }, take: 12 });
  return {
    status: sub.status, method: sub.method, amount: sub.amount.toFixed(2), trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, pastDueSince: sub.pastDueSince,
    pagamento: (({ brand, last4 }) => ({ brand, last4 }))((sub.paymentInfo ?? {}) as { brand?: string; last4?: string }),
    items: sub.items.map((i) => ({ label: i.label, price: i.price.toFixed(2) })),
    faturas: faturas.map(invoiceView),
  };
}
