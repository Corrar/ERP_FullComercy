import { Request, Response } from 'express';
import { ModuleKey } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { ctx } from './tenant-context';
import * as svc from './tenant-modules.service';
import { moduleRegistry } from '../../modules/module.registry';

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
  const row = body.enabled
    ? await svc.enableModule(ctx().tenantId, key, body.config as never)
    : await svc.disableModule(ctx().tenantId, key);
  if (body.enabled) await moduleRegistry.get(key)?.onEnable?.(ctx().tenantId);
  res.json(row);
}
