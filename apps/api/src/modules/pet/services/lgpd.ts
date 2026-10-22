// LGPD do pet shop: os animais e o que se fez com eles pertencem ao histórico do tutor. Animal no
// banho (agendado ou ainda não entregue) bloqueia; o prontuário veterinário fica (é do animal).
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const petLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const animais = await ctx().db.petAnimal.findMany({
      where: { customerId }, orderBy: { createdAt: 'asc' },
      include: { vaccines: { orderBy: { appliedAt: 'asc' } }, grooming: { orderBy: { scheduledAt: 'asc' } }, records: { orderBy: { date: 'asc' } } },
    });
    return {
      animais: animais.map((a) => ({
        nome: a.name, especie: a.species, raca: a.breed, sexo: a.sex, nascimento: a.birthDate, pesoKg: a.weightKg, porte: a.size, alergias: a.allergies, observacoes: a.notes,
        vacinas: a.vaccines.map((v) => ({ vacina: v.name, aplicadaEm: v.appliedAt, proxima: v.nextDueAt, lote: v.lot, veterinario: v.vetName })),
        banhoETosa: a.grooming.map((g) => ({ em: g.scheduledAt, servicos: g.services, valor: g.price, situacao: g.status, taxiDog: g.taxiDog, observacoes: g.notes })),
        prontuario: a.records.map((r) => ({ tipo: r.kind, data: r.date, queixa: r.complaint, diagnostico: r.diagnosis, prescricao: r.prescription, veterinario: r.vetName, retorno: r.returnAt })),
      })),
    };
  },
  async pendencias(customerId) {
    const n = await ctx().db.petGrooming.count({ where: { pet: { customerId }, status: { in: ['SCHEDULED', 'IN_PROGRESS', 'READY'] } } });
    return n ? [`${n} banho/tosa agendado ou ainda não entregue: conclua ou cancele antes.`] : [];
  },
  async anonimizar(customerId, tx) {
    await tx.petAnimal.updateMany({ where: { customerId }, data: { notes: null } });
    await tx.petGrooming.updateMany({ where: { pet: { customerId } }, data: { notes: null } });
  },
};
