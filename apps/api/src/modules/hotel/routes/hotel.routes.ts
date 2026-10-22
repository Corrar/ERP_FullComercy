import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/hotel.controller';

const router = Router();
const P = requirePermission;

router.get('/painel', P('hot.reservas:operate'), asyncHandler(c.getPainel));
router.get('/quartos', P('hot.reservas:operate'), asyncHandler(c.getQuartos));
router.post('/quartos', P('hot.quartos:manage'), asyncHandler(c.postQuarto));
router.patch('/quartos/:id', P('hot.quartos:manage'), asyncHandler(c.patchQuarto));
router.post('/quartos/:id/status', P('hot.governanca:operate'), asyncHandler(c.postStatusQuarto));

router.get('/disponiveis', P('hot.reservas:operate'), asyncHandler(c.getDisponiveis));
router.get('/reservas', P('hot.reservas:operate'), asyncHandler(c.getReservas));
router.post('/reservas', P('hot.reservas:operate'), asyncHandler(c.postReserva));
router.patch('/reservas/:id', P('hot.reservas:operate'), asyncHandler(c.patchReserva));
router.post('/reservas/:id/checkout', P('hot.reservas:operate'), asyncHandler(c.postCheckout));

router.get('/relatorios/ocupacao', P('hot.relatorios:view'), asyncHandler(c.getOcupacao));

export default router;
