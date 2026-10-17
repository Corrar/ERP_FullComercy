import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from './rbac.middleware';
import { getRoles, postRole, putRolePermissions } from './roles.controller';

const router = Router();
router.get('/', requirePermission('core.roles:manage'), asyncHandler(getRoles));
router.post('/', requirePermission('core.roles:manage'), asyncHandler(postRole));
router.put('/:id/permissions', requirePermission('core.roles:manage'), asyncHandler(putRolePermissions));
export default router;
