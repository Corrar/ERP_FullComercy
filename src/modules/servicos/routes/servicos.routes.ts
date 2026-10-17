import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/servicos.controller';

const router = Router();
router.get('/veiculos/placa/:plate', requirePermission('svc.os:view'), asyncHandler(c.getVeiculoPorPlaca));
router.post('/veiculos', requirePermission('svc.veiculos:manage'), asyncHandler(c.postVeiculo));
// A ABERTURA da OS é `POST /orders` com `moduleData.{vehicleId|plate, complaint…}`.
router.get('/os/painel', requirePermission('svc.os:view'), asyncHandler(c.getPainel));
router.post('/os/:id/mover', requirePermission('svc.os:update'), asyncHandler(c.postMoverOS));
router.get('/catalogo', requirePermission('svc.os:view'), asyncHandler(c.getCatalogo));
router.post('/catalogo', requirePermission('svc.catalogo:manage'), asyncHandler(c.postCatalogo));
export default router;
