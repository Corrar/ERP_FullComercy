#!/usr/bin/env node
// scripts/apply-rls.js — aplica prisma/sql/001_rls_tenant.sql com o papel de PLATAFORMA, via
// Prisma (sem depender de psql instalado). Idempotente; rodar após cada migration.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  // connect_timeout: mesma regra de src/infra/db-url.ts (Neon acorda devagar; o padrão de 5 s cai).
  const raw = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  const url = !raw || /[?&]connect_timeout=/.test(raw) ? raw : raw + (raw.includes('?') ? '&' : '?') + 'connect_timeout=20';
  const prisma = new PrismaClient({ datasourceUrl: url });
  let sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'sql', '001_rls_tenant.sql'), 'utf8');
  // O arquivo é escrito para psql: resolve o `\set app_role` e remove a linha.
  const role = (sql.match(/^\\set app_role (\S+)/m) || [])[1] || 'app_rw';
  sql = sql.replace(/^\\set .*$/m, '').replace(/:app_role/g, role);
  // Divide em statements de topo respeitando blocos DO $$ … $$.
  const stmts = []; let buf = ''; let inDollar = false;
  for (const line of sql.split('\n')) {
    if (/^\s*--/.test(line) && !inDollar) continue;
    buf += line + '\n';
    if ((line.match(/\$\$/g) || []).length % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(line)) { stmts.push(buf.trim()); buf = ''; }
  }
  // Banco gerenciado (Railway/Neon) nasce com UM papel. Sem o do tenant, os GRANTs falhariam e o
  // RLS não seria aplicado. Criamos o papel SEM LOGIN e SEM senha: políticas e privilégios ficam
  // prontos, e ligar o login (com senha, à mão, fora do código) é o passo de produção em TASKS.md.
  const [{ exists }] = await prisma.$queryRawUnsafe(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') AS exists`);
  if (!exists) { await prisma.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`); console.log(`Papel ${role} criado sem login (defina a senha à mão para separar os papéis).`); }
  let n = 0;
  for (const s of stmts) { if (s) { await prisma.$executeRawUnsafe(s); n++; } }
  const [{ count }] = await prisma.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_policies WHERE policyname = 'tenant_isolation'");
  console.log(`RLS aplicado: ${n} statements, ${count} políticas (papel ${role}).`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
