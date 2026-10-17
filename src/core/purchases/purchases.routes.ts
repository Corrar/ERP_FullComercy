import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import * as c from './purchases.controller';

export const suppliersRouter = Router();
suppliersRouter.get('/', requirePermission('core.purchases:view'), asyncHandler(c.getSuppliers));
suppliersRouter.post('/', requirePermission('core.suppliers:manage'), asyncHandler(c.postSupplier));
suppliersRouter.patch('/:id', requirePermission('core.suppliers:manage'), asyncHandler(c.patchSupplier));

export const purchasesRouter = Router();
purchasesRouter.get('/', requirePermission('core.purchases:view'), asyncHandler(c.getPurchases));
purchasesRouter.get('/sugestao', requirePermission('core.purchases:view'), asyncHandler(c.getSugestao));
purchasesRouter.get('/:id', requirePermission('core.purchases:view'), asyncHandler(c.getPurchase));
purchasesRouter.post('/', requirePermission('core.purchases:manage'), asyncHandler(c.postPurchase));
purchasesRouter.put('/:id/items', requirePermission('core.purchases:manage'), asyncHandler(c.putItems));
purchasesRouter.post('/:id/ordered', requirePermission('core.purchases:manage'), asyncHandler(c.postOrdered));
purchasesRouter.post('/:id/receive', requirePermission('core.purchases:manage'), asyncHandler(c.postReceive));
purchasesRouter.post('/:id/cancel', requirePermission('core.purchases:manage'), asyncHandler(c.postCancel));
