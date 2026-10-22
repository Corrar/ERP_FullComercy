// src/core/tenancy/primeiros-passos.service.ts — a ENTREGA do sistema a quem comprou: o guia de
// primeiros passos do painel. Um roteiro curto por módulo ligado (cadastrar, configurar, primeira
// operação), cada passo marcado como feito OLHANDO OS DADOS da empresa — não há checkbox para
// esquecer de marcar. O dono pode dispensar o guia; quando tudo está feito, a tela o esconde.
// O front filtra pelos passos que a pessoa pode fazer (`can(permissao)`, já cortado pelo plano).
import type { ModuleKey } from '@prisma/client';
import { prisma } from '../../infra/prisma';
import { ctx } from './tenant-context';
import { invalidateTenantCache } from './tenant-modules.service';

interface Passo { key: string; titulo: string; descricao: string; rota: string; permissao: string; feito: () => Promise<boolean> }

const tem = (n: Promise<number>) => n.then((x) => x > 0);
const vendas = (moduleKey: ModuleKey) => tem(ctx().db.order.count({ where: { moduleKey, status: { not: 'CANCELLED' } } }));

function roteiro(): Record<'CORE' | ModuleKey, Passo[]> {
  const { db } = ctx();
  return {
    CORE: [
      { key: 'equipe', titulo: 'Convide sua equipe', descricao: 'Cada pessoa com o perfil pronto do seu ramo (Caixa, Recepção, Técnico…).', rota: '/usuarios', permissao: 'core.users:manage', feito: () => tem(db.user.count({ where: { isActive: true } }).then((n) => n - 1)) },
      { key: 'marca', titulo: 'Coloque a sua marca', descricao: 'Cor e logo nos e-mails que a equipe e os clientes recebem.', rota: '/empresa', permissao: 'core.tenant:manage', feito: async () => !!((await prisma.tenant.findUnique({ where: { id: ctx().tenantId }, select: { settings: true } }))?.settings as { marca?: unknown } | null)?.marca },
    ],
    VAREJO: [
      { key: 'varejo.produtos', titulo: 'Cadastre seus produtos', descricao: 'Nome, preço e código de barras. Tem grade de tamanho e cor? Gere as variantes em Grade.', rota: '/produtos', permissao: 'core.products:manage', feito: () => tem(db.product.count()) },
      { key: 'varejo.estoque', titulo: 'Dê entrada no estoque', descricao: 'Lance o saldo inicial de cada produto.', rota: '/estoque', permissao: 'core.stock:move', feito: () => tem(db.stockMovement.count()) },
      { key: 'varejo.caixa', titulo: 'Abra o caixa', descricao: 'Informe o troco inicial do dia.', rota: '/varejo/caixa', permissao: 'varejo.pdv:operate', feito: () => tem(db.retailPosSession.count()) },
      { key: 'varejo.venda', titulo: 'Faça a primeira venda', descricao: 'Bipe o produto no PDV e receba.', rota: '/varejo/pdv', permissao: 'varejo.pdv:operate', feito: () => vendas('VAREJO') },
    ],
    FOOD: [
      { key: 'food.cardapio', titulo: 'Monte o cardápio', descricao: 'Categorias, pratos com preço e estação da cozinha.', rota: '/food/cardapio', permissao: 'food.cardapio:manage', feito: () => tem(db.foodMenuItem.count()) },
      { key: 'food.mesas', titulo: 'Cadastre as mesas', descricao: 'Número, área e lugares de cada mesa do salão.', rota: '/food/salao', permissao: 'food.salao:manage', feito: () => tem(db.foodTable.count()) },
      { key: 'food.pedido', titulo: 'Lance o primeiro pedido', descricao: 'Abra uma comanda e mande a rodada para a cozinha.', rota: '/food/salao', permissao: 'food.salao:operate', feito: () => vendas('FOOD') },
    ],
    ACADEMIA: [
      { key: 'gym.planos', titulo: 'Crie os planos', descricao: 'Mensal, trimestral, anual: preço, adesão e regras de acesso.', rota: '/academia/planos', permissao: 'gym.planos:manage', feito: () => tem(db.gymPlan.count()) },
      { key: 'gym.matricula', titulo: 'Matricule o primeiro aluno', descricao: 'A adesão paga gera a matrícula e a cobrança recorrente.', rota: '/academia/matriculas', permissao: 'gym.matriculas:manage', feito: () => tem(db.gymMembership.count()) },
      { key: 'gym.turmas', titulo: 'Monte a grade de turmas', descricao: 'Horários, capacidade e instrutor.', rota: '/academia/turmas', permissao: 'gym.turmas:manage', feito: () => tem(db.gymClass.count()) },
    ],
    SERVICOS: [
      // O catálogo nasce com serviços comuns (semente do módulo): feito = cadastrou um serviço seu.
      { key: 'svc.catalogo', titulo: 'Cadastre os seus serviços', descricao: 'Já vem com serviços comuns; acrescente os seus com preço e tempo.', rota: '/servicos/catalogo', permissao: 'svc.catalogo:manage', feito: async () => {
        const semente = await db.svcServiceCatalogItem.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
        return !!semente && tem(db.svcServiceCatalogItem.count({ where: { createdAt: { gt: new Date(semente.createdAt.getTime() + 60_000) } } }));
      } },
      { key: 'svc.os', titulo: 'Abra a primeira ordem de serviço', descricao: 'Pela placa ou pelo cliente, com orçamento para aprovar.', rota: '/servicos/nova', permissao: 'svc.os:update', feito: () => tem(db.svcServiceOrder.count()) },
    ],
    BELEZA: [
      { key: 'bel.profissionais', titulo: 'Cadastre os profissionais', descricao: 'Com a comissão de cada um.', rota: '/beleza/cadastros', permissao: 'bel.cadastro:manage', feito: () => tem(db.belProfessional.count()) },
      { key: 'bel.servicos', titulo: 'Cadastre os serviços', descricao: 'Duração e preço: a agenda usa a duração para não encavalar horário.', rota: '/beleza/cadastros', permissao: 'bel.cadastro:manage', feito: () => tem(db.belService.count()) },
      { key: 'bel.agenda', titulo: 'Agende o primeiro atendimento', descricao: 'Escolha cliente, profissional e serviço.', rota: '/beleza/agenda', permissao: 'bel.agenda:operate', feito: () => tem(db.belAppointment.count()) },
    ],
    PET: [
      { key: 'pet.pets', titulo: 'Cadastre o primeiro pet', descricao: 'Ligado ao tutor, com espécie, porte e alergias.', rota: '/pet/pets', permissao: 'pet.pets:manage', feito: () => tem(db.petAnimal.count()) },
      { key: 'pet.banho', titulo: 'Agende um banho e tosa', descricao: 'Acompanhe até "pronto" e cobre na entrega.', rota: '/pet/banho-tosa', permissao: 'pet.banho:operate', feito: () => tem(db.petGrooming.count()) },
    ],
    CLINICA: [
      { key: 'cli.profissionais', titulo: 'Cadastre os profissionais', descricao: 'Especialidade, registro (CRM, CRO…) e valor da consulta.', rota: '/clinica/cadastros', permissao: 'cli.cadastro:manage', feito: () => tem(db.cliProfessional.count()) },
      { key: 'cli.agenda', titulo: 'Agende a primeira consulta', descricao: 'Particular ou por convênio.', rota: '/clinica/agenda', permissao: 'cli.agenda:operate', feito: () => tem(db.cliAppointment.count()) },
    ],
    HOTEL: [
      { key: 'hot.quartos', titulo: 'Cadastre os quartos', descricao: 'Número, tipo, capacidade e diária.', rota: '/hotel/quartos', permissao: 'hot.quartos:manage', feito: () => tem(db.hotRoom.count()) },
      { key: 'hot.reserva', titulo: 'Faça a primeira reserva', descricao: 'O check-in abre a conta já com as diárias.', rota: '/hotel/reservas', permissao: 'hot.reservas:operate', feito: () => tem(db.hotReservation.count()) },
    ],
  };
}

/** Passos dos módulos ligados (módulos primeiro, o core no fim), cada um com `feito`. */
export async function primeirosPassos() {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx().tenantId }, select: { settings: true } });
  const dispensado = !!((t.settings as { primeirosPassos?: { dispensadoEm?: string } } | null)?.primeirosPassos?.dispensadoEm);
  const r = roteiro();
  const fontes = [...ctx().modules.keys(), 'CORE' as const];
  const passos = await Promise.all(fontes.flatMap((m) => (r[m] ?? []).map(async ({ feito, ...p }) => ({ ...p, modulo: m, feito: await feito() }))));
  return { dispensado, passos };
}

/** "Não mostrar mais" (o dono pode trazer de volta em Empresa). */
export async function dispensarPrimeirosPassos(dispensar: boolean) {
  const { tenantId } = ctx();
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
  const settings = { ...((t.settings ?? {}) as Record<string, unknown>), primeirosPassos: dispensar ? { dispensadoEm: new Date().toISOString() } : {} };
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: settings as never } });
  invalidateTenantCache(tenantId);
  return { dispensado: dispensar };
}
