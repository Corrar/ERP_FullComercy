#!/usr/bin/env node
// scripts/prisma-admin.js — roda o Prisma CLI como PLATAFORMA.
// O CLI lê `DATABASE_URL` do schema; em produção essa é a URL do papel do TENANT (sem acesso a
// `_prisma_migrations`). Este wrapper carrega o .env, troca DATABASE_URL pela DATABASE_ADMIN_URL
// (quando existe) e repassa os argumentos. A credencial vai por AMBIENTE do processo filho,
// nunca por argumento (regra da casa).
//   node scripts/prisma-admin.js migrate deploy
require('dotenv/config');
const { spawnSync } = require('node:child_process');
// connect_timeout: mesma regra de src/infra/db-url.ts (Neon acorda devagar; o padrão de 5 s cai).
const withTimeout = (u) => (!u || /[?&]connect_timeout=/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'connect_timeout=20');
const url = withTimeout(process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL);
const env = { ...process.env, DATABASE_URL: url, ...(process.env.DATABASE_ADMIN_URL ? { DATABASE_ADMIN_URL: url } : {}) };
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
