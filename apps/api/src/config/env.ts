// src/config/env.ts — as variáveis de ambiente, validadas UMA vez no boot.
// Falta de variável obrigatória derruba o processo antes do `listen`: é melhor morrer no deploy
// do que responder 500 no primeiro login.
import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /// ONDE este deploy roda, separado do NODE_ENV (que é modo de execução do Node/Express):
  /// `production` = clientes reais pagando; `staging` = homologação/demonstração pública com
  /// cobrança e Google SIMULADOS; `local` = máquina do dev. Ausente: `production` se NODE_ENV for
  /// production, senão `local` — esquecer a variável nunca libera simulador num deploy.
  APP_STAGE: z.enum(['local', 'staging', 'production']).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  /// Quantos proxies confiáveis ficam na frente do Express (`trust proxy`). Decide o `req.ip` que o
  /// rate limit e o Turnstile usam. Conta cada salto que ACRESCENTA ao X-Forwarded-For depois do
  /// cliente. Homologação (medido no log em 21/10/2026): navegador → Vercel (rewrite `/api`) →
  /// Cloudflare do Render → proxy interno do Render (10.x) → Express = 4. Com 1 o log mostrava
  /// 10.26.240.130 para todo mundo; com 2, IPs da Cloudflare — e todos dividiam a cota do rate limit.
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
  /// Teto GLOBAL de requisições por minuto por IP (as rotas sensíveis têm limites próprios, menores).
  /// Só o teste de navegador sobe isso: a suíte inteira sai de um IP só em ~1 min e passava dos 600.
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
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
  BILLING_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  /// Stripe (BILLING_PROVIDER=stripe). A chave secreta fica SÓ no servidor; a publicável vai para o
  /// navegador pelo catálogo (é pública por definição). O segredo do webhook confere a assinatura.
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, 'STRIPE_SECRET_KEY deve começar com sk_test_/sk_live_').optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().regex(/^pk_(test|live)_/, 'STRIPE_PUBLISHABLE_KEY deve começar com pk_test_/pk_live_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/).optional(),
  /// Cloudflare Turnstile (anti-robô em login, cadastro, esqueci a senha e checkout). Sem as duas,
  /// a verificação fica desligada — permitido só fora de produção.
  TURNSTILE_SITE_KEY: z.string().min(10).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(10).optional(),
  /// Token que o webhook do provedor `mock` precisa mandar em `x-billing-token`. Sem ele, o webhook mock não aceita nada.
  BILLING_MOCK_WEBHOOK_TOKEN: z.string().min(16).optional(),
  /// Dias de teste grátis da primeira compra.
  BILLING_TRIAL_DAYS: z.coerce.number().int().nonnegative().default(7),
  /// Dias de atraso tolerados antes de a cobrança suspender a empresa.
  BILLING_GRACE_DAYS: z.coerce.number().int().nonnegative().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('⛔ Ambiente inválido:', parsed.error.flatten().fieldErrors);
  process.exit(78); // EX_CONFIG
}
const stage = parsed.data.APP_STAGE ?? (parsed.data.NODE_ENV === 'production' ? 'production' : 'local');

/**
 * Combinações que NÃO podem subir. Função pura (testada em `test/config.test.ts`): o boot imprime e
 * morre com exit 78 — melhor cair no deploy do que cobrar errado ou abrir a porta para robô.
 *   • produção com simulador (cobrança mock, Google simulado) dá ERP sem pagar;
 *   • produção com chave de TESTE do Stripe não cobra ninguém; homologação com chave REAL cobraria
 *     de verdade numa tela que diz "demonstração";
 *   • Stripe sem as duas chaves não tokeniza nem cobra;
 *   • produção sem Turnstile deixa cadastro, login e checkout (teste de cartão roubado) abertos a robô.
 */
export function configProblems(c: z.infer<typeof envSchema>, st: 'local' | 'staging' | 'production'): string[] {
  const out: string[] = [];
  if (st === 'production' && (c.GOOGLE_AUTH_MOCK || c.BILLING_PROVIDER === 'mock')) out.push('GOOGLE_AUTH_MOCK=1 e BILLING_PROVIDER=mock só valem fora de produção (APP_STAGE=staging|local).');
  if (c.BILLING_PROVIDER === 'stripe') {
    if (!c.STRIPE_SECRET_KEY || !c.STRIPE_PUBLISHABLE_KEY) out.push('BILLING_PROVIDER=stripe exige STRIPE_SECRET_KEY e STRIPE_PUBLISHABLE_KEY.');
    const live = [c.STRIPE_SECRET_KEY, c.STRIPE_PUBLISHABLE_KEY].filter(Boolean).map((k) => /_live_/.test(k!));
    if (live.length === 2 && live[0] !== live[1]) out.push('Chaves do Stripe misturam modo de teste e modo real.');
    if (st === 'production' && live.some((l) => !l)) out.push('Produção exige chaves REAIS do Stripe (sk_live_/pk_live_).');
    if (st !== 'production' && live.some((l) => l)) out.push('Chave REAL do Stripe fora de produção cobraria de verdade numa tela de demonstração.');
  }
  if (!!c.TURNSTILE_SITE_KEY !== !!c.TURNSTILE_SECRET_KEY) out.push('TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY vão juntas.');
  if (st === 'production' && !c.TURNSTILE_SECRET_KEY) out.push('Produção exige Cloudflare Turnstile (TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY).');
  // Sem SMTP o cliente compra e nunca recebe os dados de acesso nem o "esqueci a senha".
  if (st === 'production' && !c.SMTP_HOST) out.push('Produção exige e-mail de verdade (SMTP_HOST, e SMTP_USER/SMTP_PASS se o servidor pedir).');
  return out;
}

const problems = configProblems(parsed.data, stage);
if (problems.length) {
  console.error('⛔ Ambiente inválido:\n - ' + problems.join('\n - '));
  process.exit(78);
}

export const env = { ...parsed.data, APP_STAGE: stage };
export const isProd = env.NODE_ENV === 'production';
