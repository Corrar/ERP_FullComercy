// src/core/tenancy/marca.service.ts — a MARCA DA EMPRESA no sistema: logo, cor e o link de acesso
// da equipe. Uma fonte só para as três vitrines:
//   • o menu do sistema logado (`GET /tenant/marca`, qualquer usuário da empresa);
//   • a página de acesso da equipe, antes do login (`GET /public/marca/:slug`, só nome/cor/logo);
//   • os e-mails (`marcaDaEmpresa` em infra/mail-templates.ts).
//
// O logo é ARQUIVO enviado pela empresa (não link): conferido pela assinatura dos bytes (PNG, JPEG,
// WebP — SVG não, porque carrega script), até 256 KB, e servido com `nosniff` e CSP vazia.
import { prisma, tenantTransaction } from '../../infra/prisma';
import { ctx } from './tenant-context';
import { AppError } from '../../shared/errors';

export const LOGO_MAX_BYTES = 256 * 1024;
export const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Tipo pela assinatura do arquivo — o Content-Type do envio é só uma declaração. */
export function tipoDaImagem(b: Buffer): (typeof LOGO_TIPOS)[number] | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export interface MarcaSettings { cor?: string; corNoSistema?: boolean; logoUrl?: string }
const marcaDe = (settings: unknown): MarcaSettings => ((settings ?? {}) as { marca?: MarcaSettings }).marca ?? {};

/** Caminho do logo na API (o front prefixa a base; o e-mail, a URL pública). `v` quebra o cache ao trocar. */
export const caminhoDoLogo = (slug: string, versao: Date) => `/public/marca/${encodeURIComponent(slug)}/logo?v=${versao.getTime().toString(36)}`;

async function montar(t: { id: string; slug: string; name: string; settings: unknown }) {
  const m = marcaDe(t.settings);
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId: t.id }, select: { updatedAt: true } });
  return {
    slug: t.slug,
    nome: t.name,
    cor: m.cor ?? null,
    /** Ligado pela empresa na tela: a cor que ia só nos e-mails não repinta o sistema sozinha. */
    corNoSistema: !!m.cor && m.corNoSistema === true,
    /** Arquivo enviado vence o link antigo (marca só dos e-mails, de antes do envio de arquivo). */
    logoUrl: logo ? caminhoDoLogo(t.slug, logo.updatedAt) : null,
    logoExterno: logo ? null : m.logoUrl ?? null,
  };
}

/** Para o sistema logado: a marca e o link que a empresa manda para a equipe. */
export async function marcaDaSessao() {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx().tenantId }, select: { id: true, slug: true, name: true, settings: true } });
  return { ...(await montar(t)), linkEquipe: `/e/${t.slug}` };
}

/** Antes do login (página `/e/<slug>`): só o que a tela de entrada mostra. Empresa encerrada some. */
export async function marcaPublica(slug: string) {
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, settings: true, status: true } });
  if (!t || t.status === 'CANCELLED') throw AppError.notFound('Empresa');
  const m = await montar(t);
  return { slug: m.slug, nome: m.nome, cor: m.cor, logoUrl: m.logoUrl };
}

export async function logoPorSlug(slug: string) {
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, status: true } });
  const logo = t && t.status !== 'CANCELLED' ? await prisma.tenantLogo.findUnique({ where: { tenantId: t.id } }) : null;
  if (!logo) throw AppError.notFound('Logo');
  return logo;
}

export async function salvarLogo(data: Buffer, declarado: string | undefined) {
  if (!data?.length) throw AppError.validation('Envie o arquivo da imagem (PNG, JPEG ou WebP).');
  if (data.length > LOGO_MAX_BYTES) throw AppError.validation(`O logo pode ter até ${LOGO_MAX_BYTES / 1024} KB.`);
  const mime = tipoDaImagem(data);
  if (!mime) throw AppError.validation('Formato não aceito: use PNG, JPEG ou WebP.');
  if (declarado && declarado.split(';')[0].trim() !== mime) throw AppError.validation('O arquivo não é do tipo que diz ser.');
  const { db, tenantId, userId } = ctx();
  await tenantTransaction(db, tenantId, async (tx) => {
    await tx.tenantLogo.upsert({ where: { tenantId }, create: { tenantId, mime, data: new Uint8Array(data) }, update: { mime, data: new Uint8Array(data) } });
    await tx.auditLog.create({ data: { tenantId, userId, action: 'tenant.marca.logo', entity: 'Tenant', entityId: tenantId, details: { mime, bytes: data.length } } });
  });
  return marcaDaSessao();
}

export async function apagarLogo() {
  const { db, tenantId, userId } = ctx();
  await tenantTransaction(db, tenantId, async (tx) => {
    await tx.tenantLogo.deleteMany({ where: { tenantId } });
    await tx.auditLog.create({ data: { tenantId, userId, action: 'tenant.marca.logo.removido', entity: 'Tenant', entityId: tenantId } });
  });
  return marcaDaSessao();
}
