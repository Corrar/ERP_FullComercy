import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { z } from 'zod';
import { getModules, getSettings, putModule, putSettings } from './tenant.controller';
import { parse } from '../../shared/http';
import { dispensarPrimeirosPassos, primeirosPassos } from './primeiros-passos.service';

const router = Router();
// Ligar/desligar módulo é decisão de dono: chave exclusiva, não herdada por "gerente".
router.get('/modules', requirePermission('core.tenant:manage'), asyncHandler(getModules));
router.put('/modules/:key', requirePermission('core.tenant:manage'), asyncHandler(putModule));
router.get('/settings', requirePermission('core.tenant:manage'), asyncHandler(getSettings));
router.put('/settings', requirePermission('core.tenant:manage'), asyncHandler(putSettings));
// Entrega a quem comprou: o guia de primeiros passos do painel (feito = olhando os dados).
router.get('/primeiros-passos', requirePermission('core.tenant:manage'), asyncHandler(async (_req, res) => { res.json(await primeirosPassos()); }));
router.post('/primeiros-passos/dispensar', requirePermission('core.tenant:manage'), asyncHandler(async (req, res) => { res.json(await dispensarPrimeirosPassos(parse(z.object({ dispensar: z.boolean().default(true) }), req.body ?? {}).dispensar)); }));

export default router;
