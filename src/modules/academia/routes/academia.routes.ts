import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/academia.controller';

const router = Router();
router.get('/planos', requirePermission('gym.planos:view'), asyncHandler(c.getPlanos));
router.post('/planos', requirePermission('gym.planos:manage'), asyncHandler(c.postPlano));
// A ADESÃO é `POST /orders` com `moduleData.planId` — não há rota própria de matrícula.
router.get('/matriculas', requirePermission('gym.matriculas:view'), asyncHandler(c.getMatriculas));
router.post('/matriculas/:id/cancelar', requirePermission('gym.matriculas:manage'), asyncHandler(c.postCancelarMatricula));
router.post('/checkins', requirePermission('gym.acesso:operate'), asyncHandler(c.postCheckIn));
router.get('/frequencia/:customerId', requirePermission('gym.matriculas:view'), asyncHandler(c.getFrequencia));
router.post('/credenciais', requirePermission('gym.acesso:manage'), asyncHandler(c.postCredencial));
router.get('/dispositivos', requirePermission('gym.acesso:manage'), asyncHandler(c.getDispositivos));
export default router;

export const publicRouter = Router();
publicRouter.post('/dispositivos/:deviceId/eventos', asyncHandler(c.postEventoDispositivo));
