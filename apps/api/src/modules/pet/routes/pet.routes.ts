import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/pet.controller';

const router = Router();
const P = requirePermission;

router.get('/pets', P('pet.pets:view'), asyncHandler(c.getPets));
router.get('/pets/:id', P('pet.pets:view'), asyncHandler(c.getPet));
router.post('/pets', P('pet.pets:manage'), asyncHandler(c.postPet));
router.patch('/pets/:id', P('pet.pets:manage'), asyncHandler(c.patchPet));

router.get('/banho-tosa', P('pet.banho:operate'), asyncHandler(c.getBanhos));
router.post('/banho-tosa', P('pet.banho:operate'), asyncHandler(c.postBanho));
router.post('/banho-tosa/:id/mover', P('pet.banho:operate'), asyncHandler(c.postMoverBanho));

router.post('/pets/:id/vacinas', P('pet.vet:manage'), asyncHandler(c.postVacina));
router.post('/pets/:id/atendimentos', P('pet.vet:manage'), asyncHandler(c.postAtendimento));
router.get('/lembretes', P('pet.vet:view'), asyncHandler(c.getLembretes));

router.get('/relatorios/resumo', P('pet.relatorios:view'), asyncHandler(c.getResumo));

export default router;
