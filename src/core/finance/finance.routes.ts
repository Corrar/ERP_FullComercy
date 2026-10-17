import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getEntries, postEntry, postSettle } from './finance.controller';

const router = Router();
router.get('/entries', requirePermission('core.finance:view'), asyncHandler(getEntries));
router.post('/entries', requirePermission('core.finance:manage'), asyncHandler(postEntry));
router.post('/entries/:id/settle', requirePermission('core.finance:manage'), asyncHandler(postSettle));
export default router;
