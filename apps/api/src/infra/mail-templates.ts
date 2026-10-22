// src/infra/mail-templates.ts — e-mail transacional em HTML com a MARCA DA EMPRESA (nome, cor,
// logo de `tenant.settings.marca`) e a versão em texto puro ao lado. Layout em tabela com estilo
// inline: é o que Gmail/Outlook respeitam. Tudo que vem de fora (nome de pessoa, de empresa) passa
// por `esc`; cor só #RRGGBB e logo só https — senão cai no padrão. Sem script, sem CSS externo.
import { prisma } from './prisma';

export interface Marca { nome: string; cor: string; logoUrl: string | null }
const COR_PADRAO = '#2563eb';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const corValida = (c: unknown) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : COR_PADRAO);
const logoValido = (u: unknown) => { try { return typeof u === 'string' && new URL(u).protocol === 'https:' ? u : null; } catch { return null; } };

/** Marca da empresa para o e-mail (leitura de plataforma: roda também fora do contexto do tenant). */
export async function marcaDaEmpresa(tenantId: string): Promise<Marca> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, settings: true } });
  const m = ((t?.settings ?? {}) as { marca?: { cor?: unknown; logoUrl?: unknown } }).marca ?? {};
  return { nome: t?.name ?? '', cor: corValida(m.cor), logoUrl: logoValido(m.logoUrl) };
}

export interface ConteudoEmail {
  marca: Marca;
  titulo: string;
  /** Parágrafos em texto puro (escapados aqui). */
  paragrafos: string[];
  botao?: { texto: string; url: string };
  /** Linha miúda do rodapé (ex.: "Se não foi você, ignore"). */
  nota?: string;
}

/** Monta HTML e texto do mesmo conteúdo. O link vai também por extenso (cliente sem HTML, cópia). */
export function emailDaEmpresa(c: ConteudoEmail): { html: string; text: string } {
  const { marca } = c; const cor = corValida(marca.cor); const logo = logoValido(marca.logoUrl);
  const cabecalho = logo
    ? `<img src="${esc(logo)}" alt="${esc(marca.nome)}" height="40" style="display:block;height:40px;max-width:200px;border:0">`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff">${esc(marca.nome)}</span>`;
  const botao = c.botao
    ? `<tr><td style="padding:8px 0 16px"><a href="${esc(c.botao.url)}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(c.botao.texto)}</a></td></tr>
       <tr><td style="font-size:12px;color:#6b7280;word-break:break-all">Se o botão não abrir, copie o endereço: ${esc(c.botao.url)}</td></tr>`
    : '';
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:${cor};padding:16px 24px">${cabecalho}</td></tr>
    <tr><td style="padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:20px;font-weight:700;padding-bottom:12px">${esc(c.titulo)}</td></tr>
      ${c.paragrafos.map((p) => `<tr><td style="font-size:15px;line-height:1.5;padding-bottom:12px">${esc(p)}</td></tr>`).join('\n      ')}
      ${botao}
    </table></td></tr>
    ${c.nota ? `<tr><td style="padding:0 24px 24px;font-size:12px;color:#6b7280">${esc(c.nota)}</td></tr>` : ''}
  </table>
  <div style="font-size:11px;color:#9ca3af;padding-top:12px">${esc(marca.nome)}</div>
</td></tr></table></body></html>`;
  const text = [c.titulo, '', ...c.paragrafos.flatMap((p) => [p, '']), ...(c.botao ? [`${c.botao.texto}: ${c.botao.url}`, ''] : []), ...(c.nota ? [c.nota] : [])].join('\n').trim();
  return { html, text };
}
