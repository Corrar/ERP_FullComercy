// test/e2e/auth-limites.test.ts — limites de tentativa do /auth. Arquivo próprio: o contador do
// express-rate-limit vive no processo, e cada arquivo de teste roda no seu.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, login } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('login trava por conta, não o escritório; refresh não divide contador com o login', async () => {
    const P = api();
    // Força bruta numa conta: 10 erradas passam (401), a 11ª é barrada.
    for (let i = 0; i < 10; i++) assert.equal((await P.raw('POST', '/auth/login', { tenant: 'fit-demo', email: 'admin@fit-demo.local', password: `errada-${i}` })).status, 401);
    assert.equal((await P.raw('POST', '/auth/login', { tenant: 'fit-demo', email: 'admin@fit-demo.local', password: 'errada-x' })).status, 429);
    // Outra pessoa no mesmo IP (mesma loja, mesma rede) segue entrando.
    const { me } = await login('burger-demo');
    assert.ok(me);
    // Equipe renovando token: antes 20 renovações por IP em 15 min derrubavam todo mundo (e o
    // mesmo contador já vinha gasto pelos logins acima).
    for (let i = 0; i < 30; i++) assert.notEqual((await P.raw('POST', '/auth/refresh', { refreshToken: `invalido-${i}` })).status, 429, `refresh ${i} barrado`);
  });
}
