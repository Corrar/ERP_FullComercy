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
