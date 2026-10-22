// LGPD da clínica. O prontuário é a exceção que a lei escreve: Lei 13.787/2018 manda guardá-lo por
// 20 anos a partir do último registro, COM a identificação do paciente — anonimizar o cadastro
// destruiria essa identificação. Por isso paciente com prontuário não é anonimizado (a recusa diz
// o porquê); o acesso aos dados (exportar) vale sempre, prontuário incluído.
import { ctx } from '../../../core/tenancy/tenant-context';
import type { ModuleLgpd } from '../../module.contract';

export const clinicaLgpd: ModuleLgpd = {
  async exportar(customerId) {
    const { db } = ctx();
    const [perfil, consultas, prontuario] = await Promise.all([
      db.cliPatientProfile.findFirst({ where: { customerId }, include: { insurance: { select: { name: true } } } }),
      db.cliAppointment.findMany({ where: { customerId }, orderBy: { startsAt: 'asc' }, include: { professional: { select: { name: true } }, insurance: { select: { name: true } } } }),
      db.cliRecord.findMany({ where: { customerId }, orderBy: { date: 'asc' }, include: { professional: { select: { name: true } } } }),
    ]);
    return {
      ficha: perfil && { nascimento: perfil.birthDate, convenio: perfil.insurance?.name ?? null, carteirinha: perfil.insuranceCard, alergias: perfil.allergies, observacoes: perfil.notes },
      consultas: consultas.map((c) => ({ em: c.startsAt, profissional: c.professional.name, tipo: c.kind, pagador: c.payer, convenio: c.insurance?.name ?? null, valor: c.price, situacao: c.status, observacoes: c.notes })),
      prontuario: prontuario.map((r) => ({ data: r.date, profissional: r.professional.name, anamnese: r.anamnesis, evolucao: r.evolution, prescricao: r.prescription, retorno: r.returnAt })),
    };
  },
  async pendencias(customerId) {
    const { db } = ctx();
    const out: string[] = [];
    const prontuario = await db.cliRecord.findFirst({ where: { customerId }, orderBy: { date: 'desc' }, select: { date: true } });
    if (prontuario) out.push(`Há prontuário clínico (último registro em ${prontuario.date.toLocaleDateString('pt-BR')}): a Lei 13.787/2018 manda guardá-lo por 20 anos com a identificação do paciente. Entregue a exportação e desative o cadastro.`);
    const futuras = await db.cliAppointment.count({ where: { customerId, OR: [{ status: 'ARRIVED' }, { status: { in: ['SCHEDULED', 'CONFIRMED'] }, startsAt: { gte: new Date() } }] } });
    if (futuras) out.push(`${futuras} consulta(s) agendada(s) ou em andamento: conclua ou cancele antes.`);
    return out;
  },
  async anonimizar(customerId, tx) {
    await tx.cliPatientProfile.updateMany({ where: { customerId }, data: { birthDate: null, insuranceCard: null, allergies: null, notes: null } });
    await tx.cliAppointment.updateMany({ where: { customerId }, data: { notes: null } });
  },
};
