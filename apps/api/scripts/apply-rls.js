#!/usr/bin/env node
// scripts/apply-rls.js — aplica prisma/sql/001_rls_tenant.sql com o papel de PLATAFORMA, via
// Prisma (sem depender de psql instalado). Idempotente; rodar após cada migration.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
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
  let n = 0;
  for (const s of stmts) { if (s) { await prisma.$executeRawUnsafe(s); n++; } }
  const [{ count }] = await prisma.$queryRawUnsafe("SELECT count(*)::int AS count FROM pg_policies WHERE policyname = 'tenant_isolation'");
  console.log(`RLS aplicado: ${n} statements, ${count} políticas (papel ${role}).`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
