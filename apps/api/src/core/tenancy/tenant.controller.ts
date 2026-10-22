import { Request, Response } from 'express';
import { ModuleKey } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { ctx } from './tenant-context';
import * as svc from './tenant-modules.service';
import { env } from '../../config/env';
import { moduleRegistry } from '../../modules/module.registry';
import { semearModulo } from '../rbac/role-templates';
import { AppError } from '../../shared/errors';

export async function getModules(_req: Request, res: Response) {
  const rows = await svc.listModules(ctx().tenantId);
  // O catálogo vem do código; o estado vem do banco. A tela mostra os dois juntos.
  const catalog = moduleRegistry.all().map((m) => ({
    key: m.key,
    name: m.name,
    description: m.description,
    enabled: rows.some((r) => r.moduleKey === m.key && r.enabled),
    config: rows.find((r) => r.moduleKey === m.key)?.config ?? {},
  }));
  res.json(catalog);
}

const putSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.unknown()).optional(),
});

export async function putModule(req: Request, res: Response) {
  const key = parse(z.nativeEnum(ModuleKey), req.params.key);
  const body = parse(putSchema, req.body);
  // Empresa contratada pela loja: módulo é item do PLANO (tem preço). Ligar aqui daria o módulo
  // sem cobrar (e desligar, cobrar sem dar). O caminho é `PUT /billing/subscription/features`.
  // Só `config` de módulo já ligado segue livre por esta rota.
  const snap = await svc.loadTenantSnapshot(ctx().tenantId);
  if (snap.planKeys && body.enabled !== snap.modules.has(key)) {
    throw AppError.conflict('Os módulos desta empresa fazem parte da assinatura. Adicione ou remova pelo menu Assinatura.');
  }
  const row = body.enabled
    ? await svc.enableModule(ctx().tenantId, key, body.config as never)
    : await svc.disableModule(ctx().tenantId, key);
  if (body.enabled) await semearModulo(ctx().tenantId, key);
  res.json(row);
}

const settingsSchema = z.object({
  defaultSalesModule: z.nativeEnum(ModuleKey).nullable().optional(),
  currency: z.string().length(3).optional(),
  name: z.string().min(2).max(160).optional(),
  document: z.string().max(20).optional(),
  timezone: z.string().max(40).optional(),
  /** Marca da empresa: cor #RRGGBB (e-mails e, com `corNoSistema`, o sistema) e logo por link https (vazio apaga; o arquivo enviado em /tenant/marca/logo vence). */
  marca: z.object({
    cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB.').optional(),
    /** A cor também pinta o sistema (menu, botões) no lugar da cor de cada módulo. */
    corNoSistema: z.boolean().optional(),
    logoUrl: z.union([z.literal(''), z.string().url().refine((u) => u.startsWith('https://'), 'O logo precisa estar num endereço https.')]).optional(),
  }).optional(),
  /** Qualquer outra chave livre da empresa (impressora, mensagens). */
  extra: z.record(z.unknown()).optional(),
});

export async function getSettings(_req: Request, res: Response) {
  const { prisma } = await import('../../infra/prisma');
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx().tenantId }, select: { id: true, slug: true, name: true, document: true, timezone: true, status: true, settings: true, createdAt: true } });
  res.json({ ...t, settings: svc.settingsParaTela(t.settings as Record<string, unknown>) });
}

/** PUT /tenant/settings — é aqui que a empresa define `defaultSalesModule` (desempate da venda). */
export async function putSettings(req: Request, res: Response) {
  const b = parse(settingsSchema, req.body);
  const { prisma } = await import('../../infra/prisma');
  const { invalidateTenantCache } = await import('./tenant-modules.service');
  const atual = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx().tenantId } });
  // `payments` só pelas rotas de Cobranças online (lá o token é conferido e selado). A exceção é o
  // simulador `mock` dos testes e da demonstração, que nem existe em produção.
  const { payments: pedido, ...extra } = b.extra ?? {};
  const settings = { ...(atual.settings as Record<string, unknown>), ...extra };
  const mock = (pedido as { mock?: unknown } | undefined)?.mock;
  if (mock && typeof mock === 'object' && env.APP_STAGE !== 'production') settings.payments = { ...((settings.payments ?? {}) as object), mock };
  if (b.defaultSalesModule !== undefined) {
    if (b.defaultSalesModule && !ctx().modules.has(b.defaultSalesModule)) return res.status(400).json({ error: `Módulo ${b.defaultSalesModule} não está ativo.`, code: 'VALIDATION' });
    if (b.defaultSalesModule) settings.defaultSalesModule = b.defaultSalesModule; else delete settings.defaultSalesModule;
  }
  if (b.currency) settings.currency = b.currency;
  if (b.marca) {
    const m = { ...((settings.marca ?? {}) as Record<string, unknown>), ...b.marca };
    if (m.logoUrl === '') delete m.logoUrl;
    settings.marca = m;
  }
  const t = await prisma.tenant.update({ where: { id: atual.id }, data: { name: b.name, document: b.document, timezone: b.timezone, settings: settings as never } });
  invalidateTenantCache(t.id);
  await ctx().db.auditLog.create({ data: { tenantId: t.id, userId: ctx().userId, action: 'tenant.settings', entity: 'Tenant', entityId: t.id, details: b as never } });
  res.json({ id: t.id, name: t.name, document: t.document, timezone: t.timezone, settings: svc.settingsParaTela(t.settings as Record<string, unknown>) });
}
