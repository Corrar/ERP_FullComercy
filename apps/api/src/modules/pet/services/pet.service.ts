// modules/pet/services/pet.service.ts — o PET (tutor = cliente do core), banho e tosa com agenda,
// vacinas com próxima dose, prontuário e os lembretes que saem deles. Venda no balcão e a entrega
// do banho viram pedido em POST /orders (pet-sales.strategy.ts).
import { PetGroomingStatus } from '@prisma/client';
import { ctx } from '../../../core/tenancy/tenant-context';
import { AppError } from '../../../shared/errors';

// ── Pets ──
export function listarPets(filter: { q?: string; customerId?: string }) {
  const q = filter.q?.trim();
  return ctx().db.petAnimal.findMany({
    where: { customerId: filter.customerId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] } : {}) },
    include: { customer: { select: { id: true, name: true, phone: true } } }, orderBy: { name: 'asc' }, take: 200,
  });
}

export async function fichaDoPet(id: string, comProntuario: boolean) {
  const { db } = ctx();
  const pet = await db.petAnimal.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, phone: true, email: true } } } });
  if (!pet) throw AppError.notFound('Pet');
  const [vacinas, banhos, compras, prontuario] = await Promise.all([
    db.petVaccine.findMany({ where: { petId: id }, orderBy: { appliedAt: 'desc' } }),
    db.petGrooming.findMany({ where: { petId: id }, orderBy: { scheduledAt: 'desc' }, take: 30 }),
    db.petSale.findMany({ where: { petId: id }, include: { order: { select: { id: true, number: true, total: true, status: true, createdAt: true } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
    comProntuario ? db.petRecord.findMany({ where: { petId: id }, orderBy: { date: 'desc' } }) : Promise.resolve(null),
  ]);
  return { ...pet, vacinas, banhos, compras: compras.map((c) => c.order), prontuario };
}

type PetInput = { customerId: string; name: string; species: string; breed?: string; sex?: string; birthDate?: Date; weightKg?: number; size?: string; allergies?: string; notes?: string };
export const cadastrarPet = (input: PetInput) => ctx().db.petAnimal.create({ data: { ...input, tenantId: ctx().tenantId } });
export const atualizarPet = (id: string, input: Partial<Omit<PetInput, 'customerId'>> & { isActive?: boolean }) => ctx().db.petAnimal.update({ where: { id }, data: input });

// ── Banho e tosa ──
export const agendaBanho = (from: Date, to: Date) => ctx().db.petGrooming.findMany({
  where: { scheduledAt: { gte: from, lt: to } },
  include: { pet: { select: { id: true, name: true, species: true, breed: true, size: true, customer: { select: { id: true, name: true, phone: true } } } } },
  orderBy: { scheduledAt: 'asc' },
});
export async function agendarBanho(input: { petId: string; scheduledAt: Date; durationMin?: number; services: string; price: number; taxiDog?: boolean; notes?: string }) {
  const pet = await ctx().db.petAnimal.findUnique({ where: { id: input.petId } });
  if (!pet?.isActive) throw AppError.validation('Pet inválido ou inativo.');
  return ctx().db.petGrooming.create({ data: { ...input, tenantId: ctx().tenantId } });
}
/** Andamento à mão. DELIVERED só pela venda (o tutor paga e leva). */
const PASSOS: Partial<Record<PetGroomingStatus, PetGroomingStatus[]>> = {
  SCHEDULED: ['IN_PROGRESS', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'SCHEDULED'],
  READY: ['IN_PROGRESS'],
  NO_SHOW: ['SCHEDULED'],
  CANCELLED: ['SCHEDULED'],
};
export async function moverBanho(id: string, to: PetGroomingStatus, extra: { scheduledAt?: Date; notes?: string } = {}) {
  const g = await ctx().db.petGrooming.findUnique({ where: { id } });
  if (!g) throw AppError.notFound('Banho/tosa');
  if (to !== g.status && !PASSOS[g.status]?.includes(to)) throw AppError.validation(to === 'DELIVERED' ? 'A entrega acontece na venda: cobre o banho no balcão.' : `Não dá para ir de ${g.status} para ${to}.`);
  return ctx().db.petGrooming.update({ where: { id }, data: { status: to, ...extra } });
}

// ── Veterinária ──
export const registrarVacina = (petId: string, input: { name: string; appliedAt: Date; nextDueAt?: Date; lot?: string; vetName?: string }) =>
  ctx().db.petVaccine.create({ data: { ...input, petId, tenantId: ctx().tenantId } });
export const registrarAtendimento = (petId: string, input: { kind: string; date?: Date; complaint?: string; diagnosis?: string; prescription?: string; weightKg?: number; vetName?: string; returnAt?: Date }) =>
  ctx().db.petRecord.create({ data: { ...input, date: input.date ?? new Date(), petId, userId: ctx().userId, tenantId: ctx().tenantId } });

/** Lembretes: vacinas vencidas ou vencendo e retornos marcados, dentro de `dias` a partir de hoje. */
export async function lembretes(dias: number) {
  const { db } = ctx();
  const hoje = new Date(new Date().toISOString().slice(0, 10));
  const ate = new Date(hoje.getTime() + dias * 86400000);
  const pet = { select: { id: true, name: true, customer: { select: { id: true, name: true, phone: true } } } } as const;
  // Só a dose MAIS RECENTE de cada vacina conta: aplicada a nova, a próxima da antiga sai da lista.
  const vacinas = await db.petVaccine.findMany({ where: { nextDueAt: { lte: ate } }, include: { pet }, orderBy: { nextDueAt: 'asc' } });
  const recentes = await db.petVaccine.groupBy({ by: ['petId', 'name'], _max: { appliedAt: true } });
  const ultima = new Map(recentes.map((r) => [`${r.petId}|${r.name}`, r._max.appliedAt!.getTime()]));
  const retornos = await db.petRecord.findMany({ where: { returnAt: { gte: hoje, lte: ate } }, include: { pet }, orderBy: { returnAt: 'asc' } });
  return {
    vacinas: vacinas.filter((v) => ultima.get(`${v.petId}|${v.name}`) === v.appliedAt.getTime()).map((v) => ({ ...v, vencida: v.nextDueAt! < hoje })),
    retornos,
  };
}

// ── Relatórios ──
export async function resumo(from: Date, to: Date) {
  const { db, tenantId } = ctx();
  const [banhos, porTipo] = await Promise.all([
    db.petGrooming.groupBy({ by: ['status'], where: { scheduledAt: { gte: from, lt: to } }, _count: true, _sum: { price: true } }),
    db.$queryRaw<{ tipo: string; itens: number; total: string }[]>`
      SELECT CASE WHEN i.kind = 'SERVICE' THEN 'Serviços' ELSE 'Produtos' END AS tipo, COUNT(*)::int AS itens, SUM(i.total)::text AS total
        FROM core_order_items i JOIN core_orders o ON o.id = i.order_id
       WHERE o.tenant_id = ${tenantId}::uuid AND o.module_key = 'PET' AND o.status = 'COMPLETED' AND o.completed_at >= ${from} AND o.completed_at < ${to}
       GROUP BY 1 ORDER BY 1`,
  ]);
  const pets = await db.petSale.findMany({ where: { createdAt: { gte: from, lt: to }, petId: { not: null } }, distinct: ['petId'], select: { petId: true } });
  return { banhos: banhos.map((b) => ({ status: b.status, quantidade: b._count, valor: String(b._sum.price ?? 0) })), porTipo, petsAtendidos: pets.length };
}
