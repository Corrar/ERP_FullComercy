// src/config/env.ts — as variáveis de ambiente, validadas UMA vez no boot.
// Falta de variável obrigatória derruba o processo antes do `listen`: é melhor morrer no deploy
// do que responder 500 no primeiro login.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /// Conexão do TENANT: papel comum, sujeito ao RLS. É a que o código de negócio usa.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ausente'),
  /// Conexão da PLATAFORMA: papel com BYPASSRLS (login, onboarding, jobs). Ausente = mesma URL
  /// (dev com superuser). Em produção com RLS ligado, é OBRIGATÓRIA — sem ela o login não vê usuário.
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  /// "1" (default): toda operação fora de transação vai em lote com o GUC do tenant (RLS estrito
  /// funciona). "0": sem embrulho — use só se o banco NÃO tem RLS (ou o papel o atravessa).
  TENANT_RLS: z.string().default('1').transform((v) => !['0', 'false', 'off'].includes(v.toLowerCase())),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default(''),
  /// TTL (ms) do cache em memória de "tenant + módulos ativos". Curto de propósito: ligar um
  /// módulo tem de aparecer em segundos, não em minutos.
  TENANT_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(15_000),
  /// Chave da API de PLATAFORMA (`/platform/*`: criar empresa, suspender, ligar módulo). Sem ela
  /// as rotas respondem 404 — a plataforma simplesmente não existe nesse deploy.
  PLATFORM_API_KEY: z.string().min(32).optional(),
  /// Chave da cifra de segredos guardados em JSON (token de catraca, chaves de gateway).
  APP_ENCRYPTION_KEY: z.string().min(16).optional(),
  /// URL pública do FRONT (links de e-mail: redefinir senha, convite).
  APP_URL: z.string().url().default('http://localhost:5173'),
  /// E-mail transacional. Sem SMTP_HOST, provedor `console` (loga o link; nada sai).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('FullComercy <no-reply@fullcomercy.local>'),
  /// Auditoria HTTP genérica de toda mutação autenticada (além das auditorias de negócio). "1" liga.
  AUDIT_HTTP: z.string().default('0').transform((v) => ['1', 'true', 'on'].includes(v.toLowerCase())),
  /// Jobs em processo (cobrança recorrente, sessões de turma…). "0"/"false" desliga.
  JOBS_ENABLED: z.string().default('1').transform((v) => !['0', 'false', 'off'].includes(v.toLowerCase())),
  // ── Loja de módulos / assinatura do SaaS ──
  /// Vida do token da CONTA do comprador (loja, carrinho, checkout). Não abre empresa: para isso
  /// a conta troca por uma sessão de tenant (`POST /account/companies/:id/session`).
  ACCOUNT_TOKEN_TTL: z.string().default('12h'),
  /// Client ID OAuth do Google (Google Identity Services). Sem ele, "Entrar com Google" fica indisponível.
  GOOGLE_CLIENT_ID: z.string().optional(),
  /// "1" aceita credencial simulada do Google (`mock.<base64url json>`). Só dev/teste; recusado em produção.
  GOOGLE_AUTH_MOCK: z.string().default('0').transform((v) => ['1', 'true', 'on'].includes(v.toLowerCase())),
  /// Provedor de cobrança da assinatura (`core/billing/providers`). `mock` simula cartão, boleto e Pix
  /// Automático; recusado em produção — lá entra o adaptador do gateway real.
  BILLING_PROVIDER: z.string().default('mock'),
  /// Token que o webhook do provedor `mock` precisa mandar em `x-billing-token`. Sem ele, o webhook mock não aceita nada.
  BILLING_MOCK_WEBHOOK_TOKEN: z.string().min(16).optional(),
  /// Dias de teste grátis da primeira compra.
  BILLING_TRIAL_DAYS: z.coerce.number().int().nonnegative().default(7),
  /// Dias de atraso tolerados antes de a cobrança suspender a empresa.
  BILLING_GRACE_DAYS: z.coerce.number().int().nonnegative().default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('⛔ Ambiente inválido:', parsed.error.flatten().fieldErrors);
  process.exit(78); // EX_CONFIG
}
// Os dois simuladores dão acesso sem pagar ou sem Google de verdade: em produção são erro de
// configuração, não escolha. Falha no boot (mesma régua das variáveis obrigatórias).
if (parsed.data.NODE_ENV === 'production' && (parsed.data.GOOGLE_AUTH_MOCK || parsed.data.BILLING_PROVIDER === 'mock')) {
  console.error('⛔ Ambiente inválido: GOOGLE_AUTH_MOCK=1 e BILLING_PROVIDER=mock são só de desenvolvimento.');
  process.exit(78);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
