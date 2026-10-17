// src/modules/require-module.middleware.ts — porta do módulo: 403 se a empresa não o tem ativo.
// Vem DEPOIS do tenantContext (precisa de `ctx().modules`) e ANTES de `requirePermission`:
// não adianta ter a permissão 'food.cozinha:update' numa empresa sem o módulo Food.
import { NextFunction, Request, Response } from 'express';
import type { ModuleKey } from '@prisma/client';
import { AppError } from '../shared/errors';
import { isModuleActive } from '../core/tenancy/tenant-context';

export function requireModule(key: ModuleKey) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!isModuleActive(key)) {
      return next(new AppError('MODULE_INACTIVE', `O módulo ${key} não está ativo para esta empresa.`));
    }
    next();
  };
}
