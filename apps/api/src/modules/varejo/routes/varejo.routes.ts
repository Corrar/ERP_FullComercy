import { Router } from 'express';
import { asyncHandler } from '../../../shared/http';
import { requirePermission } from '../../../core/rbac/rbac.middleware';
import * as c from '../controllers/varejo.controller';

// Tudo aqui já está atrás de `requireModule('VAREJO')` (posto pelo registro de módulos).
// A VENDA em si NÃO tem rota aqui: é `POST /orders` do core com `moduleData.posSessionId`.
const router = Router();
const P = requirePermission;

router.get('/caixa', P('varejo.pdv:operate'), asyncHandler(c.getSessoes));
router.get('/caixa/atual', P('varejo.pdv:operate'), asyncHandler(c.getSessaoAtual));
router.post('/caixa/abrir', P('varejo.pdv:operate'), asyncHandler(c.postAbrirCaixa));
router.post('/caixa/:id/fechar', P('varejo.pdv:close'), asyncHandler(c.postFecharCaixa));
router.post('/caixa/:id/movimentos', P('varejo.pdv:operate'), asyncHandler(c.postMovimentoCaixa));
router.get('/caixa/:id/resumo', P('varejo.pdv:operate'), asyncHandler(c.getResumoCaixa));

router.get('/grade/eixos', P('core.products:view'), asyncHandler(c.getEixos));
router.post('/grade/eixos', P('varejo.grade:manage'), asyncHandler(c.postEixo));
router.post('/grade/eixos/:axisId/valores', P('varejo.grade:manage'), asyncHandler(c.postValor));
router.post('/grade/gerar', P('varejo.grade:manage'), asyncHandler(c.postGerarGrade));
router.get('/grade/:productId/estoque', P('core.stock:view'), asyncHandler(c.getMatrizEstoque));

router.get('/etiquetas/modelos', P('varejo.etiquetas:print'), asyncHandler(c.getModelos));
router.post('/etiquetas/modelos', P('varejo.etiquetas:print'), asyncHandler(c.postModelo));
router.post('/etiquetas/lotes', P('varejo.etiquetas:print'), asyncHandler(c.postLoteEtiquetas));
router.get('/etiquetas/lotes/:id', P('varejo.etiquetas:print'), asyncHandler(c.getLoteExpandido));
router.get('/etiquetas/lotes/:id/zpl', P('varejo.etiquetas:print'), asyncHandler(c.getLoteZpl));
router.get('/etiquetas/lotes/:id/pdf', P('varejo.etiquetas:print'), asyncHandler(c.getLotePdf));
router.post('/etiquetas/lotes/:id/impresso', P('varejo.etiquetas:print'), asyncHandler(c.postLoteImpresso));

router.get('/vendedores', P('varejo.comissoes:view'), asyncHandler(c.getVendedores));
router.post('/vendedores', P('varejo.comissoes:manage'), asyncHandler(c.postVendedor));
router.patch('/vendedores/:id', P('varejo.comissoes:manage'), asyncHandler(c.patchVendedor));
router.get('/comissoes', P('varejo.comissoes:view'), asyncHandler(c.getComissoes));
router.get('/comissoes/regras', P('varejo.comissoes:view'), asyncHandler(c.getRegras));
router.post('/comissoes/regras', P('varejo.comissoes:manage'), asyncHandler(c.postRegra));
router.delete('/comissoes/regras/:id', P('varejo.comissoes:manage'), asyncHandler(c.deleteRegra));
router.post('/comissoes/aprovar', P('varejo.comissoes:manage'), asyncHandler(c.postAprovarComissoes));
router.post('/comissoes/pagar', P('varejo.comissoes:manage'), asyncHandler(c.postPagarComissoes));

router.get('/devolucoes', P('varejo.devolucoes:manage'), asyncHandler(c.getDevolucoes));
router.post('/devolucoes', P('varejo.devolucoes:manage'), asyncHandler(c.postDevolucao));
router.get('/devolucoes/vales/:customerId', P('varejo.pdv:operate'), asyncHandler(c.getVales));

router.get('/relatorios/vendedores', P('varejo.relatorios:view'), asyncHandler(c.getRelVendedores));
router.get('/relatorios/horas', P('varejo.relatorios:view'), asyncHandler(c.getRelHoras));
router.get('/relatorios/abc', P('varejo.relatorios:view'), asyncHandler(c.getRelAbc));
router.get('/relatorios/resumo', P('varejo.relatorios:view'), asyncHandler(c.getRelResumo));
router.get('/relatorios/pagamentos', P('varejo.relatorios:view'), asyncHandler(c.getRelPagamentos));
router.get('/relatorios/sem-giro', P('varejo.relatorios:view'), asyncHandler(c.getRelSemGiro));
export default router;
