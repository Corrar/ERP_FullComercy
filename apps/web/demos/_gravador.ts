// demos/_gravador.ts — grava a TELA REAL do ERP fazendo o que cada função da loja promete. Cada
// roteiro (demos/*.demo.ts) vira /demos/<chave-da-função>.mp4 + pôster, que o card da loja mostra.
//
// Como uma gravação nasce limpa e curta:
//   • empresa NOVA por comércio a cada rodada (API de plataforma, banco LOCAL): a tela não carrega o
//     lixo dos e2e ("Cliente UI X7F…");
//   • dados de exemplo pela própria API, com nomes de verdade (seeds/*.ts);
//   • a sessão entra no localStorage antes da primeira página: o vídeo começa na tela, sem login;
//   • o Playwright não grava o ponteiro: um cursor desenhado na página anda até o alvo e "clica";
//   • `inicio()` liga a câmera (screencast do Chromium); `demos/finalizar.mjs` monta o mp4.
import { test as base, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url)); // web é "type": "module"
export const API = 'http://127.0.0.1:3300';
export const SAIDA = join(AQUI, '.saida');
/** Janela pequena + menu recolhido: no tamanho do card, o conteúdo da função fica legível. */
export const TELA = { width: 1024, height: 640 };
const SENHA = 'Demo-gravacao-123';

/** Chave da API de plataforma do .env LOCAL da API (não é credencial de produção). */
function platformKey(): string {
  if (process.env.PLATFORM_API_KEY) return process.env.PLATFORM_API_KEY;
  const env = readFileSync(join(AQUI, '..', '..', 'api', '.env'), 'utf8');
  const k = /^PLATFORM_API_KEY=(.+)$/m.exec(env)?.[1]?.trim();
  if (!k) throw new Error('PLATFORM_API_KEY ausente em apps/api/.env — o gravador cria empresas pela API de plataforma.');
  return k;
}

export type Modulo = 'VAREJO' | 'FOOD' | 'ACADEMIA' | 'SERVICOS';
export interface Empresa { slug: string; session: Record<string, unknown>; h: Record<string, string>; api: Api }
export type Api = <T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, data?: unknown) => Promise<T>;

const NOME: Record<Modulo, string> = { VAREJO: 'Loja Bella Moda', FOOD: 'Hamburgueria Brasa', ACADEMIA: 'Academia Corpo Ativo', SERVICOS: 'Auto Center Silva' };
const rodada = Date.now().toString(36);
const empresas = new Map<Modulo, Promise<Empresa>>();

/** Uma empresa por comércio por rodada; `semear` roda uma vez, logo depois de criada. */
export function empresa(request: APIRequestContext, m: Modulo, semear?: (e: Empresa) => Promise<void>): Promise<Empresa> {
  if (!empresas.has(m)) empresas.set(m, (async () => {
    const slug = `demo-${m.toLowerCase()}-${rodada}`;
    const c = await request.post(`${API}/platform/tenants`, { headers: { 'x-platform-key': platformKey() }, data: { slug, name: NOME[m], adminName: 'Marina Costa', adminEmail: `marina@${slug}.local`, adminPassword: SENHA, modules: [m] } });
    expect(c.ok(), await c.text()).toBeTruthy();
    const l = await request.post(`${API}/auth/login`, { data: { tenant: slug, email: `marina@${slug}.local`, password: SENHA } });
    expect(l.ok(), await l.text()).toBeTruthy();
    const session = await l.json();
    const h = { authorization: `Bearer ${session.accessToken}` };
    const api: Api = async (method, path, data) => {
      const r = await request.fetch(`${API}${path}`, { method, headers: h, data });
      if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
      const t = await r.text();
      return (t ? JSON.parse(t) : null) as never;
    };
    const e = { slug, session, h, api };
    if (semear) await semear(e);
    return e;
  })());
  return empresas.get(m)!;
}

/** Cursor visível + destaque do clique (o vídeo do Playwright não tem ponteiro). */
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:-40px;top:-40px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform .12s';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX - 3 + 'px'; c.style.top = e.clientY - 2 + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      c.style.transform = 'scale(.82)';
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;width:34px;height:34px;left:' + (e.clientX - 17) + 'px;top:' + (e.clientY - 17) + 'px;background:rgba(79,70,229,.28);transition:transform .45s,opacity .45s';
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.9)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  });`;

export interface Gravacao {
  page: Page;
  /** Liga a câmera: o vídeo começa AQUI (carregamento e preparação ficam de fora). */
  inicio(): Promise<void>;
  /** O quadro de AGORA vira a capa (pôster) do card. Sem chamar: o último quadro. */
  capa(): void;
  pausa(ms?: number): Promise<void>;
  clicar(alvo: Locator): Promise<void>;
  digitar(alvo: Locator, texto: string): Promise<void>;
  passar(alvo: Locator): Promise<void>;
}

/**
 * `gravar(chave, empresa, rota)`: abre a tela já logado e devolve os gestos da gravação. A câmera é
 * o screencast do próprio Chromium (CDP): quadros JPEG com a hora em que foram pintados. Não usa o
 * vídeo do Playwright, que depende de um ffmpeg próprio que nem toda máquina tem. Ao fim, quadros +
 * duração de cada um vão para demos/.saida/<chave>/ e `finalizar.mjs` monta o mp4.
 * Tema escuro por padrão: o vídeo é a "tela do sistema" dentro do card e fica bem nos dois temas.
 */
export const test = base.extend<{ gravar: (chave: string, e: Empresa, rota: string, tema?: 'light' | 'dark') => Promise<Gravacao> }>({
  gravar: async ({ browser }, use) => {
    let fechar: (() => Promise<void>) | null = null;
    await use(async (chave, e, rota, tema = 'dark') => {
      const ctx = await browser.newContext({ viewport: TELA, deviceScaleFactor: 1, locale: 'pt-BR', colorScheme: tema });
      await ctx.addInitScript(([s, th]) => {
        localStorage.setItem('fc.session', s as string);
        localStorage.setItem('fc.theme', th as string);
        localStorage.setItem('fc.terminal', 'CAIXA-1');
        localStorage.setItem('fc.sidebar', 'c');
      }, [JSON.stringify(e.session), tema]);
      await ctx.addInitScript(CURSOR);
      const page = await ctx.newPage();
      await page.goto(rota);
      await page.mouse.move(TELA.width * 0.55, TELA.height * 0.45);

      const cdp = await ctx.newCDPSession(page);
      const quadros: { data: string; ts: number }[] = [];
      let gravando = false;
      let capa: number | null = null;
      cdp.on('Page.screencastFrame', (f) => {
        if (gravando) quadros.push({ data: f.data, ts: f.metadata.timestamp ?? Date.now() / 1000 });
        void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      const mover = async (alvo: Locator) => {
        await alvo.scrollIntoViewIfNeeded();
        const b = await alvo.boundingBox();
        if (!b) throw new Error(`alvo sem caixa: ${alvo}`);
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
        await page.waitForTimeout(160);
      };
      const g: Gravacao = {
        page,
        inicio: async () => {
          gravando = true;
          await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: TELA.width, maxHeight: TELA.height, everyNthFrame: 1 });
          // Garante um primeiro quadro mesmo se nada se mexer: o screencast só manda quando pinta.
          await page.mouse.move(TELA.width * 0.55 + 1, TELA.height * 0.45);
        },
        capa: () => { capa = quadros.length ? quadros.length - 1 : 0; },
        pausa: (ms = 900) => page.waitForTimeout(ms),
        clicar: async (alvo) => { await mover(alvo); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); await page.waitForTimeout(350); },
        digitar: async (alvo, texto) => { await g.clicar(alvo); await alvo.pressSequentially(texto, { delay: 55 }); await page.waitForTimeout(250); },
        passar: mover,
      };
      fechar = async () => {
        const fim = Date.now() / 1000;
        await cdp.send('Page.stopScreencast').catch(() => {});
        await ctx.close();
        if (!quadros.length) throw new Error(`${chave}: nenhum quadro gravado (faltou g.inicio()?)`);
        const dir = join(SAIDA, chave);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        // Lista do demuxer concat do ffmpeg: cada quadro dura até o próximo; o último, até o fim.
        const linhas: string[] = [];
        quadros.forEach((q, i) => {
          const nome = `${String(i).padStart(5, '0')}.jpg`;
          writeFileSync(join(dir, nome), Buffer.from(q.data, 'base64'));
          const ate = i + 1 < quadros.length ? quadros[i + 1].ts : Math.max(fim, q.ts + 0.04);
          linhas.push(`file '${nome}'`, `duration ${Math.max(0.001, ate - q.ts).toFixed(3)}`);
        });
        linhas.push(`file '${String(quadros.length - 1).padStart(5, '0')}.jpg'`);
        writeFileSync(join(dir, 'quadros.txt'), linhas.join('\n') + '\n');
        writeFileSync(join(SAIDA, `${chave}.json`), JSON.stringify({ chave, lista: join(dir, 'quadros.txt'), capa: join(dir, `${String(capa ?? quadros.length - 1).padStart(5, '0')}.jpg`), duracao: fim - quadros[0].ts }));
      };
      return g;
    });
    if (fechar) await (fechar as () => Promise<void>)();
  },
});
export { expect };
