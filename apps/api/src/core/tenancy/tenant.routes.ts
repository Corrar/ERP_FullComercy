import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../shared/http';
import { requirePermission } from '../rbac/rbac.middleware';
import { z } from 'zod';
import { getModules, getSettings, putModule, putSettings } from './tenant.controller';
import { parse } from '../../shared/http';
import { dispensarPrimeirosPassos, primeirosPassos } from './primeiros-passos.service';
import { apagarLogo, logoPorSlug, LOGO_MAX_BYTES, marcaDaSessao, marcaPublica, salvarLogo } from './marca.service';

const router = Router();
// Ligar/desligar módulo é decisão de dono: chave exclusiva, não herdada por "gerente".
router.get('/modules', requirePermission('core.tenant:manage'), asyncHandler(getModules));
router.put('/modules/:key', requirePermission('core.tenant:manage'), asyncHandler(putModule));
router.get('/settings', requirePermission('core.tenant:manage'), asyncHandler(getSettings));
router.put('/settings', requirePermission('core.tenant:manage'), asyncHandler(putSettings));
// Entrega a quem comprou: o guia de primeiros passos do painel (feito = olhando os dados).
router.get('/primeiros-passos', requirePermission('core.tenant:manage'), asyncHandler(async (_req, res) => { res.json(await primeirosPassos()); }));
router.post('/primeiros-passos/dispensar', requirePermission('core.tenant:manage'), asyncHandler(async (req, res) => { res.json(await dispensarPrimeirosPassos(parse(z.object({ dispensar: z.boolean().default(true) }), req.body ?? {}).dispensar)); }));
// Marca da empresa: QUALQUER usuário lê (o menu de todo mundo sai com a logo e a cor); só quem
// gere a empresa troca. O logo vai como o próprio arquivo no corpo (Content-Type da imagem).
router.get('/marca', asyncHandler(async (_req, res) => { res.json(await marcaDaSessao()); }));
router.put('/marca/logo', requirePermission('core.tenant:manage'),
  express.raw({ type: () => true, limit: LOGO_MAX_BYTES + 1 }),
  asyncHandler(async (req, res) => { res.json(await salvarLogo(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), req.get('content-type'))); }));
router.delete('/marca/logo', requirePermission('core.tenant:manage'), asyncHandler(async (_req, res) => { res.json(await apagarLogo()); }));

export default router;

/** Antes do login: a página de acesso da equipe (`/e/<slug>`) e o arquivo do logo (menu, e-mail). */
export const publicMarcaRouter = Router();
publicMarcaRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
publicMarcaRouter.get('/:slug', asyncHandler(async (req, res) => { res.json(await marcaPublica(String(req.params.slug))); }));
publicMarcaRouter.get('/:slug/logo', asyncHandler(async (req, res) => {
  const logo = await logoPorSlug(String(req.params.slug));
  res.set({
    'Content-Type': logo.mime,
    // A URL leva a versão (`?v=`): pode guardar por muito tempo; trocar o logo muda a URL.
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.send(Buffer.from(logo.data));
}));
