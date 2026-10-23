// test/e2e/cobranca-pix.test.ts — função "Cobrança online" pronta para usar: a empresa cadastra a
// chave Pix, cobra um pedido (copia e cola com o valor + QR + link para o cliente), o cliente vê a
// página pública, o operador confirma e o pagamento entra no pedido.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run } from './_harness';
import { crc16 } from '../../src/shared/pix';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('Cobrança online: chave Pix → cobrar pedido → link público → confirmar → pedido pago', async () => {
    const slug = `pix-${run.toLowerCase()}`;
    await api().post('/platform/tenants', { slug, name: `Oficina Pix ${run}`, adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['SERVICOS'] }, { 'x-platform-key': process.env.PLATFORM_API_KEY! });
    const A = api((await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken);
    const cli = await A.post('/customers', { name: `Cliente Pix ${run}` });
    const os = await A.post('/orders', { customerId: cli.id, items: [{ kind: 'SERVICE', description: 'Alinhamento', quantity: 1, unitPrice: 50 }], moduleData: { plate: `PIX${String(Date.now()).slice(-4)}` } });

    // Sem chave: a tela diz o que fazer, e não sobra cobrança órfã.
    const semChave = await A.raw('POST', '/payments/intents', { provider: 'manual', method: 'PIX', orderId: os.id });
    assert.equal(semChave.status, 400); assert.match(semChave.body.error, /chave Pix/);
    assert.equal((await A.get('/payments/intents')).length, 0);

    // Chave: validada e normalizada (celular com +55 vira só dígitos com +).
    assert.equal((await A.raw('PUT', '/payments/config/pix', { chave: '11 9999-8888', nome: 'Oficina', cidade: 'São Paulo' })).status, 400, 'celular sem +55 é ambíguo');
    const cfg = await A.put('/payments/config/pix', { chave: '+55 (11) 99999-8888', nome: 'Oficina Pix Ltda', cidade: 'São Paulo' });
    assert.equal(cfg.chave, '+5511999998888');
    assert.deepEqual(await A.get('/payments/config/pix'), { chave: '+5511999998888', nome: 'Oficina Pix Ltda', cidade: 'São Paulo' });

    // Cobrar: copia e cola no padrão do Banco Central, com o valor que falta, QR e link.
    const it = await A.post('/payments/intents', { provider: 'manual', method: 'PIX', orderId: os.id });
    assert.match(it.qrCode, /^000201/);
    assert.ok(it.qrCode.includes('0014br.gov.bcb.pix0114+5511999998888'), 'chave dentro do campo 26');
    assert.ok(it.qrCode.includes('540550.00'), 'valor de 50,00');
    assert.ok(it.qrCode.includes('5916Oficina Pix Ltda6009Sao Paulo'), 'nome e cidade sem acento');
    assert.equal(it.qrCode.slice(-4), crc16(it.qrCode.slice(0, -4)), 'CRC confere');
    assert.match(it.qrSvg, /^<svg/);
    const token = /\/pagar\/([^/?#]+)$/.exec(it.checkoutUrl)?.[1];
    assert.ok(token, 'link para mandar ao cliente');

    // Página pública: marca, valor e Pix — e nada além.
    const pub = await api().get(`/public/payments/link/${token}`);
    assert.equal(pub.empresa.nome, `Oficina Pix ${run}`);
    assert.equal(Number(pub.valor), 50); assert.equal(pub.status, 'PENDING'); assert.equal(pub.pix, it.qrCode);
    assert.ok(!('orderId' in pub) && !JSON.stringify(pub).includes(cli.name), 'sem dados do pedido nem do cliente');
    assert.equal((await api().raw('GET', `/public/payments/link/${token}x`)).status, 404, 'token adulterado');

    // Confirmar: o pagamento entra no pedido e o link deixa de mostrar o Pix.
    await A.post(`/payments/intents/${it.id}/confirm`);
    const pedido = await A.get(`/orders/${os.id}`);
    assert.deepEqual(pedido.payments.map((p: any) => [p.method, Number(p.amount)]), [['PIX', 50]]);
    const depois = await api().get(`/public/payments/link/${token}`);
    assert.equal(depois.status, 'PAID'); assert.equal(depois.pix, null); assert.equal(depois.qrSvg, null);
    assert.equal((await A.raw('POST', '/payments/intents', { provider: 'manual', method: 'PIX', orderId: os.id })).status, 400, 'nada mais a cobrar');
  });
}
