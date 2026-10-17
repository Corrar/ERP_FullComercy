import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/servicos.controller';

const router = Router();
const P = requirePermission;

router.get('/veiculos', P('svc.os:view'), asyncHandler(c.getVeiculos));
router.get('/veiculos/placa/:plate', P('svc.os:view'), asyncHandler(c.getVeiculoPorPlaca));
router.get('/veiculos/:id/historico', P('svc.os:view'), asyncHandler(c.getHistorico));
router.post('/veiculos', P('svc.veiculos:manage'), asyncHandler(c.postVeiculo));
router.patch('/veiculos/:id', P('svc.veiculos:manage'), asyncHandler(c.patchVeiculo));

// A ABERTURA da OS é `POST /orders` com `moduleData.{vehicleId|plate, complaint…}`;
// o ORÇAMENTO são itens em `POST /orders/:id/items`. Aqui fica o que é de oficina.
router.get('/os/painel', P('svc.os:view'), asyncHandler(c.getPainel));
router.get('/os/por-pedido/:orderId', P('svc.os:view'), asyncHandler(c.getOSPorPedido));
router.get('/os/:id', P('svc.os:view'), asyncHandler(c.getOS));
router.patch('/os/:id', P('svc.os:update'), asyncHandler(c.patchOS));
router.post('/os/:id/mover', P('svc.os:update'), asyncHandler(c.postMoverOS));
router.post('/os/:id/orcamento', P('svc.os:update'), asyncHandler(c.postOrcamento));
router.post('/os/:id/aprovar', P('svc.os:update'), asyncHandler(c.postAprovar));
router.put('/os/:id/tecnico', P('svc.os:update'), asyncHandler(c.putTecnico));
router.post('/os/:id/checklist', P('svc.os:update'), asyncHandler(c.postChecklist));
router.patch('/os/:id/checklist/:itemId', P('svc.os:update'), asyncHandler(c.patchChecklistItem));
router.post('/os/:id/anexos', P('svc.os:update'), asyncHandler(c.postAnexo));

router.get('/catalogo', P('svc.os:view'), asyncHandler(c.getCatalogo));
router.post('/catalogo', P('svc.catalogo:manage'), asyncHandler(c.postCatalogo));
router.patch('/catalogo/:id', P('svc.catalogo:manage'), asyncHandler(c.patchCatalogo));

router.get('/agenda', P('svc.agenda:operate'), asyncHandler(c.getAgenda));
router.post('/agenda', P('svc.agenda:operate'), asyncHandler(c.postAgendar));
router.patch('/agenda/:id', P('svc.agenda:operate'), asyncHandler(c.patchAgendamento));
router.post('/agenda/:id/chegada', P('svc.os:update'), asyncHandler(c.postChegada));

router.get('/relatorios/status', P('svc.os:view'), asyncHandler(c.getRelStatus));
router.get('/relatorios/tecnicos', P('svc.relatorios:view'), asyncHandler(c.getRelTecnicos));
router.get('/relatorios/servicos', P('svc.relatorios:view'), asyncHandler(c.getRelServicos));
router.get('/relatorios/retorno', P('svc.relatorios:view'), asyncHandler(c.getRelRetorno));
export default router;
