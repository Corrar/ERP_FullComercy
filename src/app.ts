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
import { authenticate } from './core/auth/auth.middleware';
import { tenantContext } from './core/tenancy/tenant.middleware';
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

export const corsOrigins = () => env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

export function buildApp() {
  // 0. Registro: estratégia do core primeiro, depois cada módulo se apresenta.
  salesStrategies.registerCore(coreSalesStrategy);
  registerAllModules();

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  const origins = corsOrigins();
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      cb(new Error('Bloqueio CORS: origem não permitida'), false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  }));

  // 1. Público.
  app.get('/health', (_req, res) => res.json({ ok: true, sha: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev' }));
  app.use('/auth', authRouter);
  moduleRegistry.mountPublic(app);
  // Plataforma: só existe se houver chave configurada.
  if (env.PLATFORM_API_KEY) { app.use('/platform', platformRouter); console.log('[platform] /platform ligado'); }

  // 2. Privado — core.
  const priv = [authenticate, tenantContext] as const;
  app.use('/tenant', ...priv, tenantRouter);
  app.use('/users', ...priv, usersRouter);
  app.use('/roles', ...priv, rolesRouter);
  app.use('/customers', ...priv, customersRouter);
  app.use('/products', ...priv, productsRouter);
  app.use('/stock', ...priv, stockRouter);
  app.use('/finance', ...priv, financeRouter);
  app.use('/orders', ...priv, ordersRouter);
  app.use('/audit', ...priv, auditRouter);

  // 3. Privado — módulos, em /m/<módulo>, cada um atrás do seu requireModule.
  moduleRegistry.mountAuthenticated(app, ...priv);

  // 4. Toda chave cobrada por rota tem de existir no catálogo. Falha no boot, não em produção.
  assertAllRequiredKeysAreDeclared();

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
