import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getCustomer, getCustomers, postAddress, postCustomer, putCustomer } from './customers.controller';

const router = Router();
router.get('/', requirePermission('core.customers:view'), asyncHandler(getCustomers));
router.get('/:id', requirePermission('core.customers:view'), asyncHandler(getCustomer));
router.post('/', requirePermission('core.customers:manage'), asyncHandler(postCustomer));
router.put('/:id', requirePermission('core.customers:manage'), asyncHandler(putCustomer));
router.post('/:id/addresses', requirePermission('core.customers:manage'), asyncHandler(postAddress));
export default router;
