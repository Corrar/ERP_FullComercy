import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/beleza.controller';

const router = Router();
const P = requirePermission;

router.get('/profissionais', P('bel.agenda:operate'), asyncHandler(c.getProfissionais));
router.post('/profissionais', P('bel.cadastro:manage'), asyncHandler(c.postProfissional));
router.patch('/profissionais/:id', P('bel.cadastro:manage'), asyncHandler(c.patchProfissional));
router.get('/servicos', P('bel.agenda:operate'), asyncHandler(c.getServicos));
router.post('/servicos', P('bel.cadastro:manage'), asyncHandler(c.postServico));
router.patch('/servicos/:id', P('bel.cadastro:manage'), asyncHandler(c.patchServico));

router.get('/agenda', P('bel.agenda:operate'), asyncHandler(c.getAgenda));
router.post('/agenda', P('bel.agenda:operate'), asyncHandler(c.postAgendamento));
router.patch('/agenda/:id', P('bel.agenda:operate'), asyncHandler(c.patchAgendamento));

router.get('/pacotes', P('bel.agenda:operate'), asyncHandler(c.getPacotes));
router.post('/pacotes', P('bel.pacotes:manage'), asyncHandler(c.postPacote));
router.patch('/pacotes/:id', P('bel.pacotes:manage'), asyncHandler(c.patchPacote));
router.get('/pacotes/cliente/:customerId', P('bel.agenda:operate'), asyncHandler(c.getPacotesDoCliente));

router.get('/comissoes', P('bel.comissoes:view'), asyncHandler(c.getComissoes));
router.post('/comissoes/pagar', P('bel.comissoes:manage'), asyncHandler(c.postPagarComissoes));

router.get('/relatorios/profissionais', P('bel.relatorios:view'), asyncHandler(c.getRelProfissionais));
router.get('/relatorios/servicos', P('bel.relatorios:view'), asyncHandler(c.getRelServicos));
router.get('/relatorios/faltas', P('bel.relatorios:view'), asyncHandler(c.getRelFaltas));

export default router;
