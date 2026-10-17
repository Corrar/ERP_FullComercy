import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { getOrder, getOrders, postCancel, postOrder, postPayments, postTransition } from './order.controller';

const router = Router();
router.get('/', requirePermission('core.orders:view'), asyncHandler(getOrders));
router.get('/:id', requirePermission('core.orders:view'), asyncHandler(getOrder));
// POST /orders é a ÚNICA porta de criação de venda, para TODOS os módulos. O módulo é
// resolvido dentro do service; os módulos expõem só rotas do que é exclusivo deles.
router.post('/', requirePermission('core.orders:create'), asyncHandler(postOrder));
router.post('/:id/payments', requirePermission('core.orders:create'), asyncHandler(postPayments));
router.post('/:id/transition', requirePermission('core.orders:create'), asyncHandler(postTransition));
router.post('/:id/cancel', requirePermission('core.orders:cancel'), asyncHandler(postCancel));
export default router;
