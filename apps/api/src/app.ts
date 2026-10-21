// src/app.ts — a montagem do Express. A ORDEM aqui é comportamento:
//   público  → /health, /auth/*, /public/<módulo>  (sem token)
//   privado  → authenticate → tenantContext → [requireModule] → requirePermission → controller
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './shared/http';
import { csvMiddleware } from './shared/csv';
import { requestLog } from './shared/request-log';
import { auditHttp } from './shared/audit-http';
import dashboardRouter from './core/dashboard/dashboard.routes';
import { prisma } from './infra/prisma';
import { authenticate } from './core/auth/auth.middleware';
import { tenantContext, tenantContextAllowSuspended } from './core/tenancy/tenant.middleware';
import { assertAllRequiredKeysAreDeclared } from './core/rbac/rbac.middleware';
import { salesStrategies } from './core/orders/sales-strategy';
import { coreSalesStrategy } from './core/orders/core-sales.strategy';
import { moduleRegistry } from './modules/module.registry';
import { registerAllModules } from './modules';

import authRouter from './core/auth/auth.routes';
import tenantRouter from './core/tenancy/tenant.routes';
import usersRouter from './core/users/users.routes';
import rolesRouter from './core/rbac/roles.routes';
import customersRouter from './core/customers/customers.routes';
import { productsRouter, stockRouter } from './core/inventory/inventory.routes';
import financeRouter from './core/finance/finance.routes';
import ordersRouter from './core/orders/order.routes';
import auditRouter from './core/audit/audit.routes';
import platformRouter from './core/platform/platform.routes';
import webhooksRouter from './core/integration/webhooks.routes';
import notificationsRouter from './core/notifications/notifications.routes';
import { purchasesRouter, suppliersRouter } from './core/purchases/purchases.routes';
import paymentsRouter, { publicRouter as paymentsPublicRouter } from './core/payments/payments.routes';
import accountRouter from './core/account/account.routes';
import billingRouter, { publicBillingRouter } from './core/billing/billing.routes';
import { startOutboxPersistence } from './core/integration/outbox.service';
import { startNotificationListeners } from './core/notifications/notifications.service';

/** Mapa de rotas montadas (para `scripts/gerar-api-md.ts`). Preenchido por buildApp(). */
export interface MountedRoute { method: string; path: string; auth: 'public' | 'platform' | 'tenant' | 'module'; module?: string; permission?: string }
export const MOUNTED_ROUTES: MountedRoute[] = [];
function collect(prefix: string, router: import('express').Router, auth: MountedRoute['auth'], module?: string) {
  for (const layer of (router as unknown as { stack: any[] }).stack ?? []) {
    if (!layer.route) continue;
    const perm = (layer.route.stack as any[]).map((l) => l.handle?.permissionKey).find(Boolean);
    for (const m of Object.keys(layer.route.methods)) MOUNTED_ROUTES.push({ method: m.toUpperCase(), path: prefix + layer.route.path, auth, module, permission: perm });
  }
}

export const corsOrigins = () => env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

/** Origem permitida? Entrada com `*` casa um rótulo de host (ex.: `https://erp-*-corrars-projects.vercel.app`
 *  para os previews da Vercel); o resto é igualdade exata. localhost sempre passa (dev). */
export function originAllowed(origin: string): boolean {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return corsOrigins().some((o) => {
    if (!o.includes('*')) return o === origin;
    const re = new RegExp('^' + o.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[a-z0-9-]+') + '$');
    return re.test(origin);
  });
}

export function buildApp() {
  // 0. Registro: estratégia do core primeiro, depois cada módulo se apresenta.
  salesStrategies.registerCore(coreSalesStrategy);
  registerAllModules();
  startOutboxPersistence();
  startNotificationListeners();

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(compression());
  // O Stripe assina os BYTES do corpo: o webhook precisa do corpo cru além do JSON. Guardado só
  // nas rotas de webhook (não custa memória no resto).
  app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => { if ((req as { url?: string }).url?.startsWith('/public/billing/webhooks/')) (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf); } }));
  app.use(requestLog);
  app.use(csvMiddleware);
  app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || originAllowed(origin)) return cb(null, true);
      cb(new Error('Bloqueio CORS: origem não permitida'), false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Turnstile-Token'],
  }));

  // 1. Público.
  app.get('/health', (_req, res) => res.json({ ok: true, sha: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev' }));
  // Readiness: só diz "pronto" com o banco respondendo (o balanceador tira a instância se falhar).
  app.get('/health/ready', async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, db: 'up' }); }
    catch { res.status(503).json({ ok: false, db: 'down' }); }
  });
  MOUNTED_ROUTES.length = 0;
  MOUNTED_ROUTES.push({ method: 'GET', path: '/health', auth: 'public' }, { method: 'GET', path: '/health/ready', auth: 'public' });
  app.use('/auth', authRouter); collect('/auth', authRouter, 'public');
  app.use('/public/payments', paymentsPublicRouter); collect('/public/payments', paymentsPublicRouter, 'public');
  // Loja de módulos: vitrine pública e a conta do comprador (token próprio, sem tenant).
  app.use('/public/billing', publicBillingRouter); collect('/public/billing', publicBillingRouter, 'public');
  app.use('/account', accountRouter); collect('/account', accountRouter, 'public');
  moduleRegistry.mountPublic(app);
  for (const m of moduleRegistry.all()) if (m.publicRouter) collect(`/public/${m.basePath}`, m.publicRouter, 'public', m.key);
  // Plataforma: só existe se houver chave configurada.
  if (env.PLATFORM_API_KEY) { app.use('/platform', platformRouter); console.log('[platform] /platform ligado'); }
  collect('/platform', platformRouter, 'platform');

  // 2. Privado — core.
  const priv = [authenticate, tenantContext, auditHttp] as const;
  const core: [string, import('express').Router][] = [
    ['/dashboard', dashboardRouter], ['/tenant', tenantRouter], ['/users', usersRouter], ['/roles', rolesRouter], ['/customers', customersRouter],
    ['/products', productsRouter], ['/stock', stockRouter], ['/finance', financeRouter], ['/orders', ordersRouter],
    ['/audit', auditRouter], ['/webhooks', webhooksRouter], ['/notifications', notificationsRouter],
    ['/suppliers', suppliersRouter], ['/purchases', purchasesRouter], ['/payments', paymentsRouter],
  ];
  for (const [prefix, router] of core) { app.use(prefix, ...priv, router); collect(prefix, router, 'tenant'); }
  // Assinatura: a única superfície aberta para a empresa suspensa (é por ela que se paga e volta).
  app.use('/billing', authenticate, tenantContextAllowSuspended, auditHttp, billingRouter); collect('/billing', billingRouter, 'tenant');

  // 3. Privado — módulos, em /m/<módulo>, cada um atrás do seu requireModule.
  moduleRegistry.mountAuthenticated(app, ...priv);
  for (const m of moduleRegistry.all()) collect(`/m/${m.basePath}`, m.router, 'module', m.key);

  // 4. Toda chave cobrada por rota tem de existir no catálogo. Falha no boot, não em produção.
  assertAllRequiredKeysAreDeclared();

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
