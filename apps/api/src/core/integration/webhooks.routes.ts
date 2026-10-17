import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as c from './webhooks.controller';

const router = Router();
router.get('/', requirePermission('core.webhooks:manage'), asyncHandler(c.getWebhooks));
router.post('/', requirePermission('core.webhooks:manage'), asyncHandler(c.postWebhook));
router.patch('/:id', requirePermission('core.webhooks:manage'), asyncHandler(c.patchWebhook));
router.get('/:id/deliveries', requirePermission('core.webhooks:manage'), asyncHandler(c.getDeliveries));
router.get('/events/list', requirePermission('core.webhooks:manage'), asyncHandler(c.getEvents));
router.post('/events/:id/retry', requirePermission('core.webhooks:manage'), asyncHandler(c.postRetry));
router.post('/events/dispatch', requirePermission('core.webhooks:manage'), asyncHandler(c.postDispatch));
export default router;
