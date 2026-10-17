import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getBalances, getProducts, postMovement, postProduct } from './inventory.controller';

export const productsRouter = Router();
productsRouter.get('/', requirePermission('core.products:view'), asyncHandler(getProducts));
productsRouter.post('/', requirePermission('core.products:manage'), asyncHandler(postProduct));

export const stockRouter = Router();
stockRouter.get('/balances', requirePermission('core.stock:view'), asyncHandler(getBalances));
stockRouter.post('/movements', requirePermission('core.stock:move'), asyncHandler(postMovement));
