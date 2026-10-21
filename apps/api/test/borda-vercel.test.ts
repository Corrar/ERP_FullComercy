// test/borda-vercel.test.ts — o front na Vercel repassa /api e /socket.io para a API (o navegador
// não fala com o Render). Trava a ordem dos rewrites, a CSP sem o domínio da API e o `trust proxy`
// que esse salto a mais exige.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';

type Rewrite = { source: string; destination: string };
const vercel = JSON.parse(readFileSync(join(__dirname, '..', '..', 'web', 'vercel.json'), 'utf8')) as {
  rewrites: Rewrite[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

test('rewrites de /api e /socket.io vêm ANTES do fallback da SPA e apontam para a mesma API', () => {
  const idx = (src: string) => vercel.rewrites.findIndex((r) => r.source === src);
  const spa = idx('/(.*)');
  assert.ok(spa >= 0, 'fallback da SPA sumiu');
  assert.equal(spa, vercel.rewrites.length - 1, 'o fallback da SPA tem de ser o último');
  const api = vercel.rewrites[idx('/api/(.*)')];
  const io = vercel.rewrites[idx('/socket.io/(.*)')];
  assert.ok(api && io, 'rewrite de /api ou /socket.io ausente');
  // /api/x → <api>/x (sem o prefixo); /socket.io/ mantém o caminho (o engine.io exige a barra final).
  assert.match(api.destination, /^https:\/\/[^/]+\/\$1$/);
  assert.equal(io.destination, new URL(api.destination.replace('$1', '')).origin + '/socket.io/$1');
});

test('CSP: connect-src só a própria origem e terceiros conhecidos — nada do host da API', () => {
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
  const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'))!;
  const apiHost = new URL(vercel.rewrites.find((r) => r.source === '/api/(.*)')!.destination.replace('$1', '')).host;
  assert.ok(connect.includes("'self'"));
  assert.ok(!connect.includes(apiHost), `connect-src ainda cita ${apiHost}: o navegador voltaria a falar direto com a API`);
});

async function ipSeen(hops: number, xff: string): Promise<string> {
  const app = express();
  app.set('trust proxy', hops);
  app.get('/', (req, res) => { res.send(req.ip); });
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/`, { headers: { 'x-forwarded-for': xff } });
    return await res.text();
  } finally {
    srv.close();
  }
}

test('TRUST_PROXY_HOPS=2 (Vercel → Render) devolve o IP do cliente; 1 devolveria o da Vercel', async () => {
  // O balanceador do Render (o socket) acrescenta quem conectou nele — a Vercel. A Vercel mandou o cliente.
  const xff = '203.0.113.7, 76.76.21.21';
  assert.equal(await ipSeen(2, xff), '203.0.113.7');
  // Contra-prova: com 1 salto, todo cliente vira o IP da Vercel e divide a cota do rate limit.
  assert.equal(await ipSeen(1, xff), '76.76.21.21');
});
