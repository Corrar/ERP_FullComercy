// src/core/rbac/role-templates.ts — O MODELO PRONTO de perfis da equipe, por módulo.
// Empresa nova (ou módulo ligado depois) já nasce com os perfis do dia a dia do ramo — Caixa no
// Varejo, Garçom e Cozinha no Food, Recepção e Profissional na Clínica… — e o dono só convida a
// equipe e escolhe o perfil. O PLANO continua cortando em `canUse`: um perfil pode citar chave de
// função não contratada; ela só passa a valer quando a empresa contratar.
//
// Regras de aplicação (`semearModulo`):
//   • perfil que não existe nasce com as chaves do modelo daquele módulo;
//   • perfil que já existe GANHA as chaves do módulo que está entrando — e nada mais. O que o dono
//     tirou de um perfil por causa de outro módulo não volta;
//   • perfis com a mesma chave em módulos diferentes somam (Posto VAREJO+FOOD: um Caixa só).
// Prontuário (clínica) e prontuário veterinário NÃO entram no Gerente: sigilo de saúde fica com
// quem atende.
import type { ModuleKey, Prisma } from '@prisma/client';
import { prisma } from '../../infra/prisma';
import { moduleRegistry } from '../../modules/module.registry';
import { permissionExists } from './permissions';

export interface PerfilModelo { key: string; name: string; permissions: string[] }

const BALCAO = ['core.customers:view', 'core.customers:manage', 'core.orders:view', 'core.orders:create', 'core.products:view'];

export const MODELOS: Record<'CORE' | ModuleKey, PerfilModelo[]> = {
  CORE: [
    { key: 'gerente', name: 'Gerente', permissions: ['core.users:view', 'core.customers:view', 'core.customers:manage', 'core.products:view', 'core.products:manage', 'core.stock:view', 'core.stock:move', 'core.orders:view', 'core.orders:create', 'core.orders:cancel', 'core.finance:view', 'core.finance:manage', 'core.purchases:view', 'core.purchases:manage', 'core.suppliers:manage', 'core.payments:manage'] },
    { key: 'financeiro', name: 'Financeiro', permissions: ['core.finance:view', 'core.finance:manage', 'core.purchases:view', 'core.suppliers:manage', 'core.orders:view', 'core.customers:view', 'core.payments:manage'] },
    { key: 'operador', name: 'Operador', permissions: ['core.customers:view', 'core.customers:manage', 'core.orders:view', 'core.orders:create', 'core.products:view', 'core.stock:view'] },
  ],
  VAREJO: [
    { key: 'caixa', name: 'Caixa', permissions: [...BALCAO, 'varejo.pdv:operate'] },
    { key: 'gerente', name: 'Gerente', permissions: ['varejo.pdv:operate', 'varejo.pdv:close', 'varejo.grade:manage', 'varejo.etiquetas:print', 'varejo.comissoes:view', 'varejo.comissoes:manage', 'varejo.devolucoes:manage', 'varejo.relatorios:view'] },
  ],
  FOOD: [
    { key: 'garcom', name: 'Garçom', permissions: ['food.salao:operate', 'core.orders:view', 'core.orders:create', 'core.products:view'] },
    { key: 'cozinha', name: 'Cozinha', permissions: ['food.cozinha:view', 'food.cozinha:update'] },
    { key: 'caixa', name: 'Caixa', permissions: [...BALCAO, 'food.salao:operate', 'food.salao:close', 'food.delivery:operate'] },
    { key: 'gerente', name: 'Gerente', permissions: ['food.salao:operate', 'food.salao:manage', 'food.salao:close', 'food.cozinha:view', 'food.cozinha:update', 'food.delivery:operate', 'food.delivery:manage', 'food.cardapio:manage', 'food.relatorios:view'] },
  ],
  ACADEMIA: [
    { key: 'recepcao', name: 'Recepção', permissions: [...BALCAO, 'gym.acesso:operate', 'gym.matriculas:view', 'gym.planos:view', 'gym.turmas:view'] },
    { key: 'instrutor', name: 'Instrutor', permissions: ['core.customers:view', 'gym.turmas:view', 'gym.turmas:manage', 'gym.matriculas:view'] },
    { key: 'gerente', name: 'Gerente', permissions: ['gym.planos:view', 'gym.planos:manage', 'gym.matriculas:view', 'gym.matriculas:manage', 'gym.acesso:operate', 'gym.acesso:manage', 'gym.turmas:view', 'gym.turmas:manage'] },
  ],
  SERVICOS: [
    { key: 'atendente', name: 'Atendente', permissions: [...BALCAO, 'svc.os:view', 'svc.os:update', 'svc.agenda:operate', 'svc.veiculos:manage'] },
    { key: 'tecnico', name: 'Técnico', permissions: ['svc.os:view', 'svc.os:update', 'core.products:view', 'core.stock:view'] },
    { key: 'gerente', name: 'Gerente', permissions: ['svc.os:view', 'svc.os:update', 'svc.veiculos:manage', 'svc.catalogo:manage', 'svc.agenda:operate', 'svc.relatorios:view'] },
  ],
  BELEZA: [
    { key: 'recepcao', name: 'Recepção', permissions: [...BALCAO, 'bel.agenda:operate'] },
    { key: 'profissional', name: 'Profissional', permissions: ['core.customers:view', 'bel.agenda:operate'] },
    { key: 'gerente', name: 'Gerente', permissions: ['bel.agenda:operate', 'bel.cadastro:manage', 'bel.pacotes:manage', 'bel.comissoes:view', 'bel.comissoes:manage', 'bel.relatorios:view'] },
  ],
  PET: [
    { key: 'atendente', name: 'Atendente', permissions: [...BALCAO, 'pet.pets:view', 'pet.pets:manage', 'pet.banho:operate'] },
    { key: 'banho_tosa', name: 'Banho e tosa', permissions: ['pet.pets:view', 'pet.banho:operate'] },
    { key: 'veterinario', name: 'Veterinário(a)', permissions: ['core.customers:view', 'pet.pets:view', 'pet.vet:view', 'pet.vet:manage'] },
    { key: 'gerente', name: 'Gerente', permissions: ['pet.pets:view', 'pet.pets:manage', 'pet.banho:operate', 'pet.relatorios:view'] },
  ],
  CLINICA: [
    { key: 'recepcao', name: 'Recepção', permissions: [...BALCAO, 'cli.agenda:operate'] },
    { key: 'profissional_saude', name: 'Profissional de saúde', permissions: ['core.customers:view', 'cli.agenda:operate', 'cli.prontuario:view', 'cli.prontuario:manage'] },
    { key: 'gerente', name: 'Gerente', permissions: ['cli.agenda:operate', 'cli.cadastro:manage', 'cli.convenios:manage', 'cli.relatorios:view'] },
  ],
  HOTEL: [
    { key: 'recepcao', name: 'Recepção', permissions: [...BALCAO, 'hot.reservas:operate'] },
    { key: 'governanca', name: 'Governança', permissions: ['hot.governanca:operate'] },
    { key: 'gerente', name: 'Gerente', permissions: ['hot.reservas:operate', 'hot.quartos:manage', 'hot.governanca:operate', 'hot.relatorios:view'] },
  ],
};

/** Boot: modelo citando chave fora do catálogo derruba a subida (como rota com chave fantasma). */
export function assertModelosUsamChavesDeclaradas() {
  const fantasmas = Object.entries(MODELOS).flatMap(([m, perfis]) => perfis.flatMap((p) => p.permissions.filter((k) => !permissionExists(k)).map((k) => `${m}/${p.key}: ${k}`)));
  if (fantasmas.length) throw new Error(`Perfis-modelo com permissão fora do catálogo:\n  ${fantasmas.join('\n  ')}`);
}

/** Cria/completa os perfis do modelo de UM módulo (ou do core). Idempotente. Client base com
 *  `tenantId` explícito: roda no onboarding, antes de haver contexto de request. */
export async function aplicarModelo(tenantId: string, de: 'CORE' | ModuleKey) {
  for (const p of MODELOS[de] ?? []) {
    const role = await prisma.role.upsert({ where: { tenantId_key: { tenantId, key: p.key } }, create: { tenantId, key: p.key, name: p.name }, update: {} });
    await prisma.rolePermission.createMany({ data: p.permissions.map((permissionKey) => ({ tenantId, roleId: role.id, permissionKey })), skipDuplicates: true });
  }
}

/** Marca em `tenant.settings`: a empresa já recebeu o modelo (nasceu com ele ou foi preenchida). */
export const MARCA_MODELO = 'perfisModelo';

/**
 * EMPRESAS ANTIGAS (criadas antes do modelo): roda UMA vez por empresa (marca em settings) e só
 * preenche perfil que não existe ou que está VAZIO. Perfil que o dono já configurou não é tocado —
 * somar chaves ali ampliaria um acesso que ele restringiu de propósito. Job de plataforma.
 */
export async function aplicarModeloNasEmpresasAntigas() {
  // Filtro em código: o filtro JSON do banco não acha quem NÃO tem a chave (NULL ≠ "diferente").
  const todas = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  const ids = todas.filter((t) => (t.settings as Record<string, unknown> | null)?.[MARCA_MODELO] !== 1).map((t) => t.id);
  const tenants = await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, settings: true, modules: { where: { enabled: true }, select: { moduleKey: true } } } });
  let preenchidos = 0;
  for (const t of tenants) {
    // Perfis com a mesma chave em módulos diferentes somam (um Caixa só no Posto).
    const alvo = new Map<string, { name: string; keys: Set<string> }>();
    for (const de of ['CORE' as const, ...t.modules.map((m) => m.moduleKey)]) {
      for (const p of MODELOS[de] ?? []) {
        const a = alvo.get(p.key) ?? { name: p.name, keys: new Set<string>() };
        p.permissions.forEach((k) => a.keys.add(k)); alvo.set(p.key, a);
      }
    }
    for (const [key, { name, keys }] of alvo) {
      const role = await prisma.role.findUnique({ where: { tenantId_key: { tenantId: t.id, key } }, include: { _count: { select: { permissions: true } } } });
      if (role?.isSystem || (role && role._count.permissions > 0)) continue;
      const r = role ?? await prisma.role.create({ data: { tenantId: t.id, key, name } });
      await prisma.rolePermission.createMany({ data: [...keys].map((permissionKey) => ({ tenantId: t.id, roleId: r.id, permissionKey })), skipDuplicates: true });
      preenchidos++;
    }
    await marcarModelo(t.id, t.settings);
  }
  return { empresas: tenants.length, perfisPreenchidos: preenchidos };
}

export const marcarModelo = (tenantId: string, settings: unknown) =>
  prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...((settings ?? {}) as Record<string, unknown>), [MARCA_MODELO]: 1 } as Prisma.InputJsonValue } });

/** Ligar um módulo numa empresa = a semente do módulo (`onEnable`) + os perfis do modelo. Todo
 *  caminho que liga módulo (onboarding, troca de plano, tela Empresa, plataforma) passa aqui. */
export async function semearModulo(tenantId: string, key: ModuleKey) {
  await moduleRegistry.get(key)?.onEnable?.(tenantId);
  await aplicarModelo(tenantId, key);
}
