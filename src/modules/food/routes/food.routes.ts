import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/food.controller';

const router = Router();
const P = requirePermission;

router.get('/mesas', P('food.salao:operate'), asyncHandler(c.getMesas));
router.post('/mesas', P('food.salao:manage'), asyncHandler(c.postMesa));
router.patch('/mesas/:id', P('food.salao:manage'), asyncHandler(c.patchMesa));
router.get('/comandas', P('food.salao:operate'), asyncHandler(c.getComandas));
router.post('/comandas', P('food.salao:operate'), asyncHandler(c.postComanda));
router.get('/comandas/:id/conta', P('food.salao:operate'), asyncHandler(c.getConta));
router.post('/comandas/:id/fechar', P('food.salao:close'), asyncHandler(c.postFecharComanda));
router.post('/comandas/:id/transferir', P('food.salao:operate'), asyncHandler(c.postTransferirComanda));
router.post('/comandas/:id/cancelar', P('food.salao:close'), asyncHandler(c.postCancelarComanda));

router.get('/cozinha/fila', P('food.cozinha:view'), asyncHandler(c.getFila));
router.get('/cozinha/estacoes', P('food.cozinha:view'), asyncHandler(c.getEstacoes));
router.post('/cozinha/tickets/:id/mover', P('food.cozinha:update'), asyncHandler(c.postMoverTicket));

router.get('/entregas', P('food.delivery:operate'), asyncHandler(c.getEntregas));
router.post('/entregas/:id/atribuir', P('food.delivery:operate'), asyncHandler(c.postAtribuir));
router.post('/entregas/:id/mover', P('food.delivery:operate'), asyncHandler(c.postMoverEntrega));
router.get('/entregadores', P('food.delivery:operate'), asyncHandler(c.getEntregadores));
router.post('/entregadores', P('food.delivery:manage'), asyncHandler(c.postEntregador));
router.patch('/entregadores/:id', P('food.delivery:manage'), asyncHandler(c.patchEntregador));
router.get('/entregadores/:id/acerto', P('food.delivery:manage'), asyncHandler(c.getAcerto));
router.get('/zonas', P('food.delivery:operate'), asyncHandler(c.getZonas));
router.get('/zonas/cep/:cep', P('food.delivery:operate'), asyncHandler(c.getZonaPorCep));
router.post('/zonas', P('food.delivery:manage'), asyncHandler(c.postZona));
router.patch('/zonas/:id', P('food.delivery:manage'), asyncHandler(c.patchZona));

router.get('/menus', P('food.cardapio:manage'), asyncHandler(c.getMenus));
router.post('/menus', P('food.cardapio:manage'), asyncHandler(c.postMenu));
router.get('/menus/:id', P('food.cardapio:manage'), asyncHandler(c.getMenu));
router.patch('/menus/:id', P('food.cardapio:manage'), asyncHandler(c.patchMenu));
router.post('/menus/:id/categorias', P('food.cardapio:manage'), asyncHandler(c.postCategoria));
router.post('/menus/:id/itens', P('food.cardapio:manage'), asyncHandler(c.postItem));
router.patch('/menus/:id/itens/:itemId', P('food.cardapio:manage'), asyncHandler(c.patchItem));
router.post('/menus/:id/itens/:itemId/adicionais', P('food.cardapio:manage'), asyncHandler(c.postLigarGrupo));
router.get('/adicionais', P('food.cardapio:manage'), asyncHandler(c.getGrupos));
router.post('/adicionais', P('food.cardapio:manage'), asyncHandler(c.postGrupo));

router.get('/relatorios/itens', P('food.relatorios:view'), asyncHandler(c.getRelItens));
router.get('/relatorios/tipos', P('food.relatorios:view'), asyncHandler(c.getRelTipos));
router.get('/relatorios/horas', P('food.relatorios:view'), asyncHandler(c.getRelHoras));
router.get('/relatorios/entregadores', P('food.relatorios:view'), asyncHandler(c.getRelEntregadores));
export default router;

/** Público: cardápio online, pedido do cliente final e acompanhamento. Rate limit próprio. */
export const publicRouter = Router();
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
publicRouter.use(publicLimiter);
publicRouter.get('/cardapio/:tenant/:menu', asyncHandler(c.getCardapioPublico));
publicRouter.post('/pedidos/:tenant', asyncHandler(c.postPedidoOnline));
publicRouter.get('/pedidos/:tenant/:numero', asyncHandler(c.getAcompanhar));
