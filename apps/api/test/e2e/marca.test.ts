// test/e2e/marca.test.ts — marca da empresa: o logo é ARQUIVO conferido pelos bytes (PNG/JPEG/WebP,
// até 256 KB), vale para todos da empresa (menu), para a página de acesso da equipe antes do login
// e para os e-mails; só quem gere a empresa troca.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, api, run, base } from './_harness';

// Os e-mails só levam logo em https: a URL pública do front, como na Vercel.
process.env.APP_URL = 'https://erp.exemplo.com.br';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  test('Marca: logo enviado, conferido e servido; cor no sistema; página da equipe; e-mail; permissão', async () => {
    const slug = `marca-${run.toLowerCase()}`;
    const t = await api().post('/platform/tenants', { slug, name: `Padaria Marca ${run}`, adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['VAREJO'] }, { 'x-platform-key': process.env.PLATFORM_API_KEY! });
    const tok = (await api().post('/auth/login', { tenant: slug, email: `admin@${slug}.local`, password: 'Senha-12345678' })).accessToken;
    const A = api(tok);
    const enviar = (corpo: Buffer, tipo: string, token = tok) => fetch(`${base()}/tenant/marca/logo`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': tipo }, body: new Uint8Array(corpo) });

    // Sem nada: sem logo e sem cor — o sistema segue com a cor de cada módulo.
    const m0 = await A.get('/tenant/marca');
    assert.equal(m0.logoUrl, null); assert.equal(m0.corNoSistema, false); assert.equal(m0.linkEquipe, `/e/${slug}`);

    // Recusas: SVG (carrega script), texto que se diz PNG, grande demais.
    const svg = await enviar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml');
    assert.equal(svg.status, 400); assert.match((await svg.json()).error, /PNG, JPEG ou WebP/);
    const falso = await enviar(Buffer.from('não sou imagem'), 'image/png');
    assert.equal(falso.status, 400);
    const jpegDizendoPng = await enviar(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), 'image/png');
    assert.match((await jpegDizendoPng.json()).error, /não é do tipo que diz ser/);
    const grande = await enviar(Buffer.concat([PNG, Buffer.alloc(300 * 1024)]), 'image/png');
    assert.equal(grande.status, 413);
    assert.equal((await A.get('/tenant/marca')).logoUrl, null, 'nada gravado nas recusas');

    // PNG de verdade: gravado, com versão na URL.
    const ok = await enviar(PNG, 'image/png');
    assert.equal(ok.status, 200);
    const m1 = await ok.json();
    assert.match(m1.logoUrl, new RegExp(`^/public/marca/${slug}/logo\\?v=`));

    // Servido sem login, com o tipo conferido e sem chance de virar página.
    const img = await fetch(base() + m1.logoUrl);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(img.headers.get('content-security-policy'), "default-src 'none'");
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(PNG), 'os mesmos bytes');

    // Cor no sistema: só quando a empresa liga.
    await A.put('/tenant/settings', { marca: { cor: '#7a1f3d' } });
    assert.equal((await A.get('/tenant/marca')).corNoSistema, false, 'cor dos e-mails não repinta o sistema sozinha');
    await A.put('/tenant/settings', { marca: { cor: '#7a1f3d', corNoSistema: true } });
    const m2 = await A.get('/tenant/marca');
    assert.equal(m2.cor, '#7a1f3d'); assert.equal(m2.corNoSistema, true);

    // Página da equipe antes do login: nome, cor, logo — e só isso.
    const pub = await api().get(`/public/marca/${slug}`);
    assert.deepEqual(Object.keys(pub).sort(), ['cor', 'logoUrl', 'nome', 'slug']);
    assert.equal(pub.nome, `Padaria Marca ${run}`); assert.equal(pub.logoUrl, m2.logoUrl);
    assert.equal((await api().raw('GET', `/public/marca/nao-existe-${run.toLowerCase()}`)).status, 404);

    // E-mail: o logo enviado vai pela URL pública do front.
    const { marcaDaEmpresa } = await import('../../src/infra/mail-templates');
    const mail = await marcaDaEmpresa(t.tenant?.id ?? t.id);
    assert.equal(mail.logoUrl, `https://erp.exemplo.com.br/api${m2.logoUrl}`); assert.equal(mail.cor, '#7a1f3d');

    // Funcionário: vê a marca (o menu dele também sai com ela), mas não troca.
    const perfil = await A.post('/roles', { key: `caixa_marca_${run.toLowerCase()}`, name: `Caixa ${run}` });
    await A.put(`/roles/${perfil.id}/permissions`, { permissions: ['core.customers:view'] });
    const email = `caixa-${run.toLowerCase()}@${slug}.local`;
    await A.post('/users', { name: `Caixa ${run}`, email, password: 'Senha-do-caixa-123', roleIds: [perfil.id] });
    const tokCaixa = (await api().post('/auth/login', { tenant: slug, email, password: 'Senha-do-caixa-123' })).accessToken;
    assert.equal((await api(tokCaixa).get('/tenant/marca')).logoUrl, m2.logoUrl);
    assert.equal((await enviar(PNG, 'image/png', tokCaixa)).status, 403);
    assert.equal((await api(tokCaixa).raw('DELETE', '/tenant/marca/logo')).status, 403);

    // Remover: some do menu, da página pública e o arquivo deixa de existir.
    assert.equal((await A.del('/tenant/marca/logo')).logoUrl, null);
    assert.equal((await api().get(`/public/marca/${slug}`)).logoUrl, null);
    assert.equal((await fetch(base() + m1.logoUrl)).status, 404);
    const aud = await A.get('/audit?action=tenant.marca.');
    assert.deepEqual(aud.map((x: any) => x.action).sort(), ['tenant.marca.logo', 'tenant.marca.logo.removido']);
  });
}
