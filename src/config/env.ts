// src/config/env.ts — as variáveis de ambiente, validadas UMA vez no boot.
// Falta de variável obrigatória derruba o processo antes do `listen`: é melhor morrer no deploy
// do que responder 500 no primeiro login.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ausente'),
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
  /// Jobs em processo (cobrança recorrente, sessões de turma…). "0"/"false" desliga.
  JOBS_ENABLED: z.string().default('1').transform((v) => !['0', 'false', 'off'].includes(v.toLowerCase())),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('⛔ Ambiente inválido:', parsed.error.flatten().fieldErrors);
  process.exit(78); // EX_CONFIG
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
