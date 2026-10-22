// src/core/platform/platform.routes.ts — a API de QUEM OPERA O SAAS (não de quem usa).
// Autenticação por chave de plataforma no header `x-platform-key`. Sem PLATFORM_API_KEY no
// ambiente, o router não é montado: a superfície não existe.
import { Router, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ModuleKey } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../config/env';
import { asyncHandler, parse } from '../../shared/http';
import { AppError } from '../../shared/errors';
import * as onboarding from './onboarding.service';
import * as mods from '../tenancy/tenant-modules.service';
import { moduleRegistry } from '../../modules/module.registry';
import { semearModulo } from '../rbac/role-templates';
import { statusDosSegredos, recifrarSegredos } from './segredos.service';

function platformAuth(req: Request, _res: Response, next: NextFunction) {
  const given = String(req.get('x-platform-key') ?? '');
  const want = env.PLATFORM_API_KEY ?? '';
  const ok = given.length === want.length && want.length > 0 && timingSafeEqual(Buffer.from(given), Buffer.from(want));
  if (!ok) return next(new AppError('UNAUTHENTICATED', 'Chave de plataforma inválida.'));
  next();
}

const router = Router();
router.use(platformAuth);

const onboardSchema = z.object({
  slug: z.string().min(4).max(60), name: z.string().min(2).max(160), document: z.string().max(20).optional(),
  adminName: z.string().max(120).optional(), adminEmail: z.string().email(), adminPassword: z.string().min(8),
  modules: z.array(z.nativeEnum(ModuleKey)).default([]), settings: z.record(z.unknown()).optional(), timezone: z.string().max(40).optional(),
});
router.post('/tenants', asyncHandler(async (req, res) => { res.status(201).json(await onboarding.onboardTenant(parse(onboardSchema, req.body))); }));
router.get('/tenants', asyncHandler(async (_req, res) => { res.json(await onboarding.listTenants()); }));
router.patch('/tenants/:id/status', asyncHandler(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED', 'TRIAL']) }), req.body);
  res.json(await onboarding.setTenantStatus(String(req.params.id), b.status));
}));
router.put('/tenants/:id/modules/:key', asyncHandler(async (req, res) => {
  const key = parse(z.nativeEnum(ModuleKey), req.params.key);
  const b = parse(z.object({ enabled: z.boolean(), config: z.record(z.unknown()).optional() }), req.body);
  const tenantId = String(req.params.id);
  const row = b.enabled ? await mods.enableModule(tenantId, key, b.config as never) : await mods.disableModule(tenantId, key);
  if (b.enabled) await semearModulo(tenantId, key);
  res.json(row);
}));
// Rotação da chave de cifra: em que chave está cada segredo, e recifrar já (sem esperar o job).
router.get('/segredos', asyncHandler(async (_req, res) => { res.json(await statusDosSegredos()); }));
router.post('/segredos/recifrar', asyncHandler(async (_req, res) => { res.json({ ...(await recifrarSegredos()), status: await statusDosSegredos() }); }));
router.get('/modules', (_req, res) => { res.json(moduleRegistry.all().map((m) => ({ key: m.key, name: m.name, description: m.description, permissions: m.permissions.length, jobs: (m.jobs ?? []).map((j) => j.name) }))); });

export default router;
