// src/core/platform/onboarding.service.ts — NASCE UMA EMPRESA. Tudo que ela precisa para o
// primeiro login funcionar: tenant, perfil admin (isSystem), usuário admin, armazém padrão,
// conta caixa, perfis da equipe prontos e módulos escolhidos (`onEnable` + perfis de cada um).
// Idempotente por slug.
// Usa o client BASE: ainda não há tenant quando isto roda.
import { ModuleKey, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../../infra/prisma';
import { aplicarModelo, semearModulo } from '../rbac/role-templates';
import { invalidateTenantCache } from '../tenancy/tenant-modules.service';
import { AppError } from '../../shared/errors';

export interface OnboardInput {
  slug: string; name: string; document?: string;
  adminName?: string; adminEmail: string; adminPassword: string;
  modules: ModuleKey[]; settings?: Record<string, unknown>; timezone?: string;
}

export async function onboardTenant(input: OnboardInput) {
  if (!/^[a-z0-9][a-z0-9-]{2,58}[a-z0-9]$/.test(input.slug)) throw AppError.validation('slug inválido (a-z, 0-9, hífen).');

  const tenant = await prisma.tenant.upsert({
    where: { slug: input.slug },
    create: { slug: input.slug, name: input.name, document: input.document, status: 'ACTIVE', timezone: input.timezone ?? 'America/Sao_Paulo', settings: (input.settings ?? {}) as Prisma.InputJsonValue },
    update: {},
  });
  const tenantId = tenant.id;

  const admin = await prisma.role.upsert({ where: { tenantId_key: { tenantId, key: 'admin' } }, create: { tenantId, key: 'admin', name: 'Administrador', isSystem: true }, update: {} });
  // Perfis da equipe já com permissões (modelo pronto): os do core aqui, os de cada módulo ao ligá-lo.
  await aplicarModelo(tenantId, 'CORE');
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: input.adminEmail.toLowerCase() } },
    create: { tenantId, email: input.adminEmail.toLowerCase(), name: input.adminName ?? 'Administrador', passwordHash: await bcrypt.hash(input.adminPassword, 12) },
    update: {},
  });
  await prisma.userRole.upsert({ where: { tenantId_userId_roleId: { tenantId, userId: user.id, roleId: admin.id } }, create: { tenantId, userId: user.id, roleId: admin.id }, update: {} });

  await prisma.warehouse.upsert({ where: { tenantId_code: { tenantId, code: 'PRINCIPAL' } }, create: { tenantId, code: 'PRINCIPAL', name: 'Estoque principal', isDefault: true }, update: {} });
  await prisma.financeAccount.upsert({ where: { tenantId_name: { tenantId, name: 'Caixa' } }, create: { tenantId, name: 'Caixa', kind: 'CASH', isDefault: true }, update: {} });
  for (const [kind, name] of [['RECEIVABLE', 'Vendas'], ['RECEIVABLE', 'Mensalidades'], ['PAYABLE', 'Fornecedores'], ['PAYABLE', 'Aluguel'], ['PAYABLE', 'Salários']] as const) {
    await prisma.financeCategory.upsert({ where: { tenantId_kind_name: { tenantId, kind, name } }, create: { tenantId, kind, name }, update: {} });
  }

  for (const moduleKey of input.modules) {
    await prisma.tenantModule.upsert({ where: { tenantId_moduleKey: { tenantId, moduleKey } }, create: { tenantId, moduleKey, enabled: true }, update: { enabled: true } });
    await semearModulo(tenantId, moduleKey);
  }
  invalidateTenantCache(tenantId);
  return { tenant, adminUserId: user.id };
}

export async function listTenants() {
  return prisma.tenant.findMany({ select: { id: true, slug: true, name: true, status: true, createdAt: true, modules: { where: { enabled: true }, select: { moduleKey: true } }, _count: { select: { users: true, orders: true } } }, orderBy: { createdAt: 'desc' } });
}

export async function setTenantStatus(tenantId: string, status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'TRIAL') {
  const t = await prisma.tenant.update({ where: { id: tenantId }, data: { status } });
  invalidateTenantCache(tenantId);
  return t;
}
