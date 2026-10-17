import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/varejo.controller';

// Tudo aqui já está atrás de `requireModule('VAREJO')` (posto pelo registro de módulos).
// A VENDA em si NÃO tem rota aqui: é `POST /orders` do core com `moduleData.posSessionId`.
const router = Router();
router.post('/caixa/abrir', requirePermission('varejo.pdv:operate'), asyncHandler(c.postAbrirCaixa));
router.post('/caixa/:id/fechar', requirePermission('varejo.pdv:close'), asyncHandler(c.postFecharCaixa));
router.get('/caixa/:id/resumo', requirePermission('varejo.pdv:operate'), asyncHandler(c.getResumoCaixa));

router.post('/grade/gerar', requirePermission('varejo.grade:manage'), asyncHandler(c.postGerarGrade));
router.get('/grade/:productId/estoque', requirePermission('core.stock:view'), asyncHandler(c.getMatrizEstoque));

router.post('/etiquetas/lotes', requirePermission('varejo.etiquetas:print'), asyncHandler(c.postLoteEtiquetas));
router.get('/etiquetas/lotes/:id', requirePermission('varejo.etiquetas:print'), asyncHandler(c.getLoteExpandido));

router.get('/vendedores', requirePermission('varejo.comissoes:view'), asyncHandler(c.getVendedores));
router.post('/vendedores', requirePermission('varejo.comissoes:manage'), asyncHandler(c.postVendedor));
router.get('/comissoes', requirePermission('varejo.comissoes:view'), asyncHandler(c.getComissoes));
export default router;
