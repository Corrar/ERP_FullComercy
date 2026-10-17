// prisma/seed.ts — ONBOARDING de uma empresa de demonstração.
// Também é o modelo do que `POST /platform/tenants` fará quando existir: tenant + admin +
// perfil admin (isSystem) + armazém padrão + conta caixa + módulos escolhidos.
import 'dotenv/config';
import { ModuleKey, Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function onboardTenant(input: { slug: string; name: string; adminEmail: string; adminPassword: string; modules: ModuleKey[]; settings?: Record<string, unknown> }) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: input.slug },
    create: { slug: input.slug, name: input.name, status: 'ACTIVE', settings: (input.settings ?? {}) as Prisma.InputJsonValue },
    update: {},
  });
  const tenantId = tenant.id;

  const admin = await prisma.role.upsert({
    where: { tenantId_key: { tenantId, key: 'admin' } },
    create: { tenantId, key: 'admin', name: 'Administrador', isSystem: true }, update: {},
  });
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: input.adminEmail } },
    create: { tenantId, email: input.adminEmail, name: 'Administrador', passwordHash: await bcrypt.hash(input.adminPassword, 12) },
    update: {},
  });
  await prisma.userRole.upsert({ where: { tenantId_userId_roleId: { tenantId, userId: user.id, roleId: admin.id } }, create: { tenantId, userId: user.id, roleId: admin.id }, update: {} });

  await prisma.warehouse.upsert({ where: { tenantId_code: { tenantId, code: 'LOJA' } }, create: { tenantId, code: 'LOJA', name: 'Loja', isDefault: true }, update: {} });
  await prisma.financeAccount.upsert({ where: { tenantId_name: { tenantId, name: 'Caixa' } }, create: { tenantId, name: 'Caixa', kind: 'CASH', isDefault: true }, update: {} });

  for (const moduleKey of input.modules) {
    await prisma.tenantModule.upsert({ where: { tenantId_moduleKey: { tenantId, moduleKey } }, create: { tenantId, moduleKey, enabled: true }, update: { enabled: true } });
  }
  return tenant;
}

async function main() {
  const senha = process.env.SEED_ADMIN_PASSWORD ?? 'Troque-esta-senha-123';
  await onboardTenant({ slug: 'loja-demo', name: 'Loja Demo (Varejo)', adminEmail: 'admin@loja-demo.local', adminPassword: senha, modules: [ModuleKey.VAREJO] });
  await onboardTenant({ slug: 'burger-demo', name: 'Burger Demo (Food)', adminEmail: 'admin@burger-demo.local', adminPassword: senha, modules: [ModuleKey.FOOD] });
  await onboardTenant({ slug: 'posto-demo', name: 'Posto Demo (Varejo + Food)', adminEmail: 'admin@posto-demo.local', adminPassword: senha, modules: [ModuleKey.VAREJO, ModuleKey.FOOD], settings: { defaultSalesModule: 'VAREJO' } });
  console.log('seed ok — tenants: loja-demo, burger-demo, posto-demo');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
