// prisma/seed.ts — empresas de demonstração, pelo MESMO onboarding da API de plataforma.
import 'dotenv/config';
import { ModuleKey } from '@prisma/client';
import { prisma } from '../src/infra/prisma';
import { registerAllModules } from '../src/modules';
import { onboardTenant } from '../src/core/platform/onboarding.service';

async function main() {
  registerAllModules();
  const senha = process.env.SEED_ADMIN_PASSWORD ?? 'Troque-esta-senha-123';
  await onboardTenant({ slug: 'loja-demo', name: 'Loja Demo (Varejo)', adminEmail: 'admin@loja-demo.local', adminPassword: senha, modules: [ModuleKey.VAREJO] });
  await onboardTenant({ slug: 'burger-demo', name: 'Burger Demo (Food)', adminEmail: 'admin@burger-demo.local', adminPassword: senha, modules: [ModuleKey.FOOD] });
  await onboardTenant({ slug: 'fit-demo', name: 'Fit Demo (Academia)', adminEmail: 'admin@fit-demo.local', adminPassword: senha, modules: [ModuleKey.ACADEMIA] });
  await onboardTenant({ slug: 'oficina-demo', name: 'Oficina Demo (Serviços)', adminEmail: 'admin@oficina-demo.local', adminPassword: senha, modules: [ModuleKey.SERVICOS] });
  await onboardTenant({ slug: 'posto-demo', name: 'Posto Demo (Varejo + Food)', adminEmail: 'admin@posto-demo.local', adminPassword: senha, modules: [ModuleKey.VAREJO, ModuleKey.FOOD], settings: { defaultSalesModule: 'VAREJO' } });
  await onboardTenant({ slug: 'salao-demo', name: 'Salão Demo (Beleza)', adminEmail: 'admin@salao-demo.local', adminPassword: senha, modules: [ModuleKey.BELEZA] });
  await onboardTenant({ slug: 'pet-demo', name: 'Pet Demo (Pet shop)', adminEmail: 'admin@pet-demo.local', adminPassword: senha, modules: [ModuleKey.PET] });
  await onboardTenant({ slug: 'clinica-demo', name: 'Clínica Demo', adminEmail: 'admin@clinica-demo.local', adminPassword: senha, modules: [ModuleKey.CLINICA] });
  await onboardTenant({ slug: 'pousada-demo', name: 'Pousada Demo (Hotelaria)', adminEmail: 'admin@pousada-demo.local', adminPassword: senha, modules: [ModuleKey.HOTEL] });
  console.log('seed ok — tenants: loja-demo, burger-demo, fit-demo, oficina-demo, posto-demo, salao-demo, pet-demo, clinica-demo, pousada-demo');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
