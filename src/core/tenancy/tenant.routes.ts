import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getModules, putModule } from './tenant.controller';

const router = Router();
// Ligar/desligar módulo é decisão de dono: chave exclusiva, não herdada por "gerente".
router.get('/modules', requirePermission('core.tenant:manage'), asyncHandler(getModules));
router.put('/modules/:key', requirePermission('core.tenant:manage'), asyncHandler(putModule));

export default router;
