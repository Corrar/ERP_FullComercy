import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as c from './users.controller';

const router = Router();
router.get('/', requirePermission('core.users:view'), asyncHandler(c.getUsers));
router.post('/', requirePermission('core.users:manage'), asyncHandler(c.postUser));
router.post('/invite', requirePermission('core.users:manage'), asyncHandler(c.postInvite));
router.post('/me/password', asyncHandler(c.postChangePassword)); // qualquer logado troca a própria
router.patch('/:id', requirePermission('core.users:manage'), asyncHandler(c.patchUser));
router.put('/:id/roles', requirePermission('core.users:manage'), asyncHandler(c.putUserRoles));
router.put('/:id/exceptions', requirePermission('core.roles:manage'), asyncHandler(c.putUserExceptions));
router.patch('/:id/active', requirePermission('core.users:manage'), asyncHandler(c.patchUserActive));
router.post('/:id/reset-password', requirePermission('core.users:manage'), asyncHandler(c.postResetPassword));
export default router;
