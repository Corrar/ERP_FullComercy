import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getModules, getSettings, putModule, putSettings } from './tenant.controller';

const router = Router();
// Ligar/desligar módulo é decisão de dono: chave exclusiva, não herdada por "gerente".
router.get('/modules', requirePermission('core.tenant:manage'), asyncHandler(getModules));
router.put('/modules/:key', requirePermission('core.tenant:manage'), asyncHandler(putModule));
router.get('/settings', requirePermission('core.tenant:manage'), asyncHandler(getSettings));
router.put('/settings', requirePermission('core.tenant:manage'), asyncHandler(putSettings));

export default router;
