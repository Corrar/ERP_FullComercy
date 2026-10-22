// test/cors.test.ts — a regra de origem do CORS (HTTP e Socket.IO usam a mesma função).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.CORS_ORIGINS = 'https://erp.example.com, https://erp-*-corrars-projects.vercel.app';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET ??= '0123456789abcdef0123456789abcdef';

test('origem exata, curinga de preview e localhost passam; o resto não', async () => {
  const { originAllowed } = await import('../src/app');
  assert.equal(originAllowed('https://erp.example.com'), true);
  assert.equal(originAllowed('https://erp-git-feature-x-corrars-projects.vercel.app'), true);
  assert.equal(originAllowed('http://localhost:5173'), true);
  // Contra-prova: o curinga cobre UM rótulo de host — não atravessa ponto nem troca o sufixo.
  assert.equal(originAllowed('https://erp-a.evil.com-corrars-projects.vercel.app'), false);
  assert.equal(originAllowed('https://erp-x-corrars-projects.vercel.app.evil.com'), false);
  assert.equal(originAllowed('https://outro.example.com'), false);
  assert.equal(originAllowed('http://erp.example.com'), false);
});

test('URL do banco ganha connect_timeout de 20 s só quando não traz um', async () => {
  const { withConnectTimeout } = await import('../src/infra/db-url');
  assert.equal(withConnectTimeout('postgresql://u@h/db?sslmode=require'), 'postgresql://u@h/db?sslmode=require&connect_timeout=20');
  assert.equal(withConnectTimeout('postgresql://u@h/db'), 'postgresql://u@h/db?connect_timeout=20');
  // Contra-prova: valor já escolhido por quem configurou não é trocado.
  assert.equal(withConnectTimeout('postgresql://u@h/db?connect_timeout=5'), 'postgresql://u@h/db?connect_timeout=5');
  assert.equal(withConnectTimeout(undefined), undefined);
});
