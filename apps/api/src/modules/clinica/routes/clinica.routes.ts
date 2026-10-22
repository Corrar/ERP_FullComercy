import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/clinica.controller';

const router = Router();
const P = requirePermission;

router.get('/profissionais', P('cli.agenda:operate'), asyncHandler(c.getProfissionais));
router.post('/profissionais', P('cli.cadastro:manage'), asyncHandler(c.postProfissional));
router.patch('/profissionais/:id', P('cli.cadastro:manage'), asyncHandler(c.patchProfissional));
router.get('/convenios', P('cli.agenda:operate'), asyncHandler(c.getConvenios));
router.post('/convenios', P('cli.convenios:manage'), asyncHandler(c.postConvenio));
router.patch('/convenios/:id', P('cli.convenios:manage'), asyncHandler(c.patchConvenio));
router.get('/convenios-a-receber', P('cli.convenios:manage'), asyncHandler(c.getAReceber));

router.get('/pacientes/:customerId', P('cli.agenda:operate'), asyncHandler(c.getPaciente));
router.put('/pacientes/:customerId/ficha', P('cli.agenda:operate'), asyncHandler(c.putPerfil));
router.post('/pacientes/:customerId/prontuario', P('cli.prontuario:manage'), asyncHandler(c.postEvolucao));

router.get('/agenda', P('cli.agenda:operate'), asyncHandler(c.getAgenda));
router.post('/agenda', P('cli.agenda:operate'), asyncHandler(c.postConsulta));
router.patch('/agenda/:id', P('cli.agenda:operate'), asyncHandler(c.patchConsulta));
router.get('/recibos/:orderId', P('cli.agenda:operate'), asyncHandler(c.getRecibo));

router.get('/relatorios/profissionais', P('cli.relatorios:view'), asyncHandler(c.getRelProfissionais));
router.get('/relatorios/convenios', P('cli.relatorios:view'), asyncHandler(c.getRelConvenios));
router.get('/relatorios/faltas', P('cli.relatorios:view'), asyncHandler(c.getRelFaltas));

export default router;
