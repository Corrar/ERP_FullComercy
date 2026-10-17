#!/usr/bin/env node
// scripts/prisma-admin.js — roda o Prisma CLI como PLATAFORMA.
// O CLI lê `DATABASE_URL` do schema; em produção essa é a URL do papel do TENANT (sem acesso a
// `_prisma_migrations`). Este wrapper carrega o .env, troca DATABASE_URL pela DATABASE_ADMIN_URL
// (quando existe) e repassa os argumentos. A credencial vai por AMBIENTE do processo filho,
// nunca por argumento (regra da casa).
//   node scripts/prisma-admin.js migrate deploy
require('dotenv/config');
const { spawnSync } = require('node:child_process');
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL };
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
