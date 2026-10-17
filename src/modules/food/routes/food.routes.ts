import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/food.controller';

const router = Router();
router.get('/mesas', requirePermission('food.salao:operate'), asyncHandler(c.getMesas));
router.post('/mesas', requirePermission('food.salao:manage'), asyncHandler(c.postMesa));
router.post('/comandas', requirePermission('food.salao:operate'), asyncHandler(c.postComanda));
router.get('/comandas/:id/conta', requirePermission('food.salao:operate'), asyncHandler(c.getConta));
router.post('/comandas/:id/fechar', requirePermission('food.salao:close'), asyncHandler(c.postFecharComanda));

router.get('/cozinha/fila', requirePermission('food.cozinha:view'), asyncHandler(c.getFila));
router.post('/cozinha/tickets/:id/mover', requirePermission('food.cozinha:update'), asyncHandler(c.postMoverTicket));

router.get('/entregas', requirePermission('food.delivery:operate'), asyncHandler(c.getEntregas));
router.post('/entregas/:id/atribuir', requirePermission('food.delivery:operate'), asyncHandler(c.postAtribuir));
router.post('/entregas/:id/mover', requirePermission('food.delivery:operate'), asyncHandler(c.postMoverEntrega));
router.get('/entregadores', requirePermission('food.delivery:operate'), asyncHandler(c.getEntregadores));
router.post('/entregadores', requirePermission('food.delivery:manage'), asyncHandler(c.postEntregador));

router.get('/menus', requirePermission('food.cardapio:manage'), asyncHandler(c.getMenus));
export default router;

/** Público: o cardápio online, sem login. Montado em /public/food/... pelo registro. */
export const publicRouter = Router();
publicRouter.get('/cardapio/:tenant/:menu', asyncHandler(c.getCardapioPublico));
