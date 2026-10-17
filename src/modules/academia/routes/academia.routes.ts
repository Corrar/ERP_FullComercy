import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/academia.controller';

const router = Router();
const P = requirePermission;

router.get('/painel', P('gym.matriculas:view'), asyncHandler(c.getPainel));
router.get('/planos', P('gym.planos:view'), asyncHandler(c.getPlanos));
router.post('/planos', P('gym.planos:manage'), asyncHandler(c.postPlano));
router.patch('/planos/:id', P('gym.planos:manage'), asyncHandler(c.patchPlano));

// A ADESÃO é `POST /orders` com `moduleData.planId` — não há rota própria de matrícula.
router.get('/matriculas', P('gym.matriculas:view'), asyncHandler(c.getMatriculas));
router.get('/matriculas/inadimplentes', P('gym.matriculas:view'), asyncHandler(c.getInadimplentes));
router.get('/matriculas/a-vencer', P('gym.matriculas:view'), asyncHandler(c.getAVencer));
router.post('/matriculas/rodar-cobranca', P('gym.matriculas:manage'), asyncHandler(c.postRodarCobranca));
router.get('/matriculas/:id/cobrancas', P('gym.matriculas:view'), asyncHandler(c.getCobrancas));
router.post('/matriculas/:id/cancelar', P('gym.matriculas:manage'), asyncHandler(c.postCancelarMatricula));
router.post('/matriculas/:id/pausar', P('gym.matriculas:manage'), asyncHandler(c.postPausar));
router.post('/matriculas/:id/retomar', P('gym.matriculas:manage'), asyncHandler(c.postRetomar));
router.post('/matriculas/:id/trocar-plano', P('gym.matriculas:manage'), asyncHandler(c.postTrocarPlano));

router.get('/presentes', P('gym.acesso:operate'), asyncHandler(c.getPresentes));
router.post('/checkins', P('gym.acesso:operate'), asyncHandler(c.postCheckIn));
router.post('/checkins/:id/checkout', P('gym.acesso:operate'), asyncHandler(c.postCheckOut));
router.get('/frequencia/:customerId', P('gym.matriculas:view'), asyncHandler(c.getFrequencia));
router.get('/credenciais/:customerId', P('gym.acesso:manage'), asyncHandler(c.getCredenciais));
router.post('/credenciais', P('gym.acesso:manage'), asyncHandler(c.postCredencial));
router.delete('/credenciais/:id', P('gym.acesso:manage'), asyncHandler(c.deleteCredencial));
router.get('/dispositivos', P('gym.acesso:manage'), asyncHandler(c.getDispositivos));
router.post('/dispositivos', P('gym.acesso:manage'), asyncHandler(c.postDispositivo));
router.patch('/dispositivos/:id', P('gym.acesso:manage'), asyncHandler(c.patchDispositivo));
router.post('/dispositivos/:id/girar-token', P('gym.acesso:manage'), asyncHandler(c.postGirarToken));
router.get('/acessos', P('gym.acesso:manage'), asyncHandler(c.getEventosAcesso));

router.get('/turmas', P('gym.turmas:view'), asyncHandler(c.getTurmas));
router.post('/turmas', P('gym.turmas:manage'), asyncHandler(c.postTurma));
router.patch('/turmas/:id', P('gym.turmas:manage'), asyncHandler(c.patchTurma));
router.post('/turmas/gerar-sessoes', P('gym.turmas:manage'), asyncHandler(c.postGerarSessoes));
router.get('/agenda', P('gym.turmas:view'), asyncHandler(c.getAgenda));
router.post('/agenda/:id/reservas', P('gym.turmas:view'), asyncHandler(c.postReserva));
router.delete('/agenda/:id/reservas/:customerId', P('gym.turmas:view'), asyncHandler(c.deleteReserva));
router.post('/agenda/:id/chamada', P('gym.turmas:manage'), asyncHandler(c.postChamada));

router.get('/relatorios/frequencia', P('gym.matriculas:view'), asyncHandler(c.getRelFrequencia));
router.get('/relatorios/pico', P('gym.matriculas:view'), asyncHandler(c.getRelPico));
router.get('/relatorios/sumidos', P('gym.matriculas:view'), asyncHandler(c.getRelSumidos));
export default router;

export const publicRouter = Router();
publicRouter.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
publicRouter.post('/dispositivos/:deviceId/eventos', asyncHandler(c.postEventoDispositivo));
