import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as c from './finance.controller';

const router = Router();
router.get('/summary', requirePermission('core.finance:view'), asyncHandler(c.getSummary));
router.get('/entries', requirePermission('core.finance:view'), asyncHandler(c.getEntries));
router.post('/entries', requirePermission('core.finance:manage'), asyncHandler(c.postEntry));
router.patch('/entries/:id', requirePermission('core.finance:manage'), asyncHandler(c.patchEntry));
router.post('/entries/:id/settle', requirePermission('core.finance:manage'), asyncHandler(c.postSettle));
router.post('/entries/:id/cancel', requirePermission('core.finance:manage'), asyncHandler(c.postCancel));
router.get('/accounts', requirePermission('core.finance:view'), asyncHandler(c.getAccounts));
router.post('/accounts', requirePermission('core.finance:manage'), asyncHandler(c.postAccount));
router.get('/categories', requirePermission('core.finance:view'), asyncHandler(c.getCategories));
router.post('/categories', requirePermission('core.finance:manage'), asyncHandler(c.postCategory));
export default router;
