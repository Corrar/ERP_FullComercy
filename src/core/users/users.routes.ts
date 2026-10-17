import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getUsers, patchUserActive, postUser, putUserRoles } from './users.controller';

const router = Router();
router.get('/', requirePermission('core.users:view'), asyncHandler(getUsers));
router.post('/', requirePermission('core.users:manage'), asyncHandler(postUser));
router.put('/:id/roles', requirePermission('core.users:manage'), asyncHandler(putUserRoles));
router.patch('/:id/active', requirePermission('core.users:manage'), asyncHandler(patchUserActive));
export default router;
