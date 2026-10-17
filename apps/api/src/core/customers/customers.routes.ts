import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as c from './customers.controller';

const router = Router();
router.get('/', requirePermission('core.customers:view'), asyncHandler(c.getCustomers));
router.get('/:id', requirePermission('core.customers:view'), asyncHandler(c.getCustomer));
router.get('/:id/summary', requirePermission('core.customers:view'), asyncHandler(c.getSummary));
router.post('/', requirePermission('core.customers:manage'), asyncHandler(c.postCustomer));
router.put('/:id', requirePermission('core.customers:manage'), asyncHandler(c.putCustomer));
router.patch('/:id/active', requirePermission('core.customers:manage'), asyncHandler(c.patchActive));
router.post('/:id/addresses', requirePermission('core.customers:manage'), asyncHandler(c.postAddress));
router.delete('/:id/addresses/:addressId', requirePermission('core.customers:manage'), asyncHandler(c.deleteAddress));
export default router;
