// src/core/customers/lgpd.service.ts — atendimento ao TITULAR (o cliente final da empresa) pela
// LGPD: "o que vocês sabem de mim?" (exportar) e "apaguem meus dados" (anonimizar).
//
// • Exportar: um documento só, legível, com o cadastro, endereços, pedidos, títulos e o que cada
//   módulo guarda sobre a pessoa (gancho `lgpd.exportar` do módulo — o core não conhece as
//   tabelas dos módulos, regra 4).
// • Anonimizar, não apagar: pedidos e títulos ficam (obrigação fiscal/contábil é base legal para
//   guardar, LGPD art. 16, I), mas sem nada que leve à pessoa. Cada módulo tira o que é dele
//   (credencial de catraca, endereço de entrega, placa…) e mantém o que a lei manda guardar
//   (prontuário). Tudo numa transação: ou some de todo lugar, ou de nenhum.
// • Recusa enquanto há vínculo em andamento (pedido aberto, matrícula ativa, reserva, agendamento
//   futuro): anonimizar alguém que ainda está sendo atendido ou cobrado quebraria o atendimento.
// • As duas operações vão para a auditoria, com quem fez e quando.
import { Prisma } from '@prisma/client';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction, type TenantTx } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { moduleRegistry } from '../../modules/module.registry';

const ABERTOS = ['DRAFT', 'OPEN', 'CONFIRMED', 'IN_PROGRESS', 'READY'] as const;

// TODOS os módulos com gancho, ligados ou não na empresa: módulo desligado não apaga as tabelas
// dele, e o que ficou lá (a credencial da catraca de quando era academia) continua sendo dado da
// pessoa — tem de sair na exportação e na anonimização.
const modulosComLgpd = () => moduleRegistry.all().filter((m) => m.lgpd);
/** Seção de módulo desligado só entra se tiver algo (senão o arquivo vira uma lista de vazios). */
const temDados = (v: unknown): boolean => Array.isArray(v) ? v.length > 0 : v !== null && typeof v === 'object' ? Object.values(v).some(temDados) : v != null;

async function titular(customerId: string) {
  const c = await ctx().db.customer.findFirst({ where: { id: customerId }, include: { addresses: true } });
  if (!c) throw AppError.notFound('Cliente');
  return c;
}

const auditar = (tx: TenantTx, action: string, customerId: string, details: Record<string, unknown>) =>
  tx.auditLog.create({ data: { tenantId: ctx().tenantId, userId: ctx().userId, action, entity: 'Customer', entityId: customerId, details: details as Prisma.InputJsonValue } });

export async function exportarTitular(customerId: string) {
  const { db, tenantId } = ctx();
  const c = await titular(customerId);
  const empresa = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, document: true } });
  const pedidos = await db.order.findMany({
    where: { customerId }, orderBy: { createdAt: 'asc' },
    select: { number: true, createdAt: true, status: true, channel: true, total: true, notes: true,
      items: { select: { description: true, quantity: true, total: true } }, payments: { select: { method: true, amount: true, paidAt: true } } },
  });
  const titulos = await db.financeEntry.findMany({ where: { customerId }, orderBy: { dueDate: 'asc' }, select: { description: true, amount: true, paidAmount: true, dueDate: true, paidAt: true, status: true } });
  const modulos: Record<string, unknown> = {};
  for (const m of modulosComLgpd()) {
    const sec = await m.lgpd!.exportar(customerId);
    if (ctx().modules.has(m.key) || temDados(sec)) modulos[m.name] = sec;
  }
  await tenantTransaction(db, tenantId, (tx) => auditar(tx, 'customer.lgpd.exportado', customerId, { pedidos: pedidos.length, modulos: Object.keys(modulos) }));
  return {
    geradoEm: new Date().toISOString(),
    controlador: { empresa: empresa.name, documento: empresa.document },
    titular: { nome: c.name, documento: c.document, email: c.email, telefone: c.phone, nascimento: c.birthDate, observacoes: c.notes, etiquetas: c.tags, ativo: c.isActive, cadastradoEm: c.createdAt },
    enderecos: c.addresses.map((a) => ({ rotulo: a.label, logradouro: a.street, numero: a.number, complemento: a.complement, bairro: a.district, cidade: a.city, uf: a.state, cep: a.zipCode })),
    pedidos: pedidos.map((p) => ({ numero: p.number, data: p.createdAt, situacao: p.status, canal: p.channel, total: p.total, observacoes: p.notes,
      itens: p.items.map((i) => ({ descricao: i.description, quantidade: i.quantity, total: i.total })),
      pagamentos: p.payments.map((x) => ({ meio: x.method, valor: x.amount, em: x.paidAt })) })),
    financeiro: titulos.map((t) => ({ descricao: t.description, valor: t.amount, pago: t.paidAmount, vencimento: t.dueDate, pagoEm: t.paidAt, situacao: t.status })),
    modulos,
  };
}

/** O que impede anonimizar agora (lista vazia = pode). */
export async function pendenciasDoTitular(customerId: string): Promise<string[]> {
  await titular(customerId);
  const out: string[] = [];
  const abertos = await ctx().db.order.count({ where: { customerId, status: { in: [...ABERTOS] } } });
  if (abertos) out.push(`${abertos} pedido(s) em aberto: conclua ou cancele antes.`);
  for (const m of modulosComLgpd()) if (m.lgpd!.pendencias) out.push(...(await m.lgpd!.pendencias(customerId)));
  return out;
}

export async function anonimizarTitular(customerId: string, confirmacao: string) {
  const { db, tenantId } = ctx();
  const c = await titular(customerId);
  if (c.name.startsWith('Titular anonimizado')) throw AppError.conflict('Este cliente já foi anonimizado.');
  // Digitar o nome é a trava contra o clique errado: não há como desfazer.
  if (confirmacao.trim().toLocaleLowerCase('pt-BR') !== c.name.trim().toLocaleLowerCase('pt-BR')) {
    throw AppError.validation('Para confirmar, digite o nome do cliente exatamente como está no cadastro.');
  }
  const pend = await pendenciasDoTitular(customerId);
  if (pend.length) throw AppError.conflict(`Não dá para anonimizar agora: ${pend.join(' ')}`);

  const rotulo = `Titular anonimizado ${c.code ?? c.id.slice(0, 8)}`;
  await tenantTransaction(db, tenantId, async (tx) => {
    await tx.customerAddress.deleteMany({ where: { tenantId, customerId } });
    await tx.customer.update({ where: { id: customerId }, data: { name: rotulo, document: null, email: null, phone: null, birthDate: null, notes: null, tags: [], isActive: false } });
    for (const m of modulosComLgpd()) await m.lgpd!.anonimizar(customerId, tx);
    // O rastro NÃO guarda o nome antigo: guardar seria desfazer a anonimização pela auditoria.
    await auditar(tx, 'customer.lgpd.anonimizado', customerId, { modulos: modulosComLgpd().map((m) => m.key) });
  });
  return { id: customerId, nome: rotulo };
}
