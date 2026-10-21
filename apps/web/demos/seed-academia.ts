// demos/seed-academia.ts — dados de exemplo da Academia Corpo Ativo, pela API (o mesmo caminho do
// cliente): planos mensal/trimestral/anual, alunos matriculados (adesão paga em POST /orders), um
// aluno inadimplente, um pausado, um cancelado, catracas com credenciais (cartão, QR, biometria),
// acessos pela catraca, check-ins da recepção, turmas com instrutor, agenda e reservas.
import type { Empresa } from './_gravador';
import { API } from './_gravador';

const DIA = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();

export const PLANOS = [
  { name: 'Mensal Livre', description: 'Musculação e aulas coletivas, todos os dias.', price: 129.9, billingCycle: 'MONTHLY', enrollmentFee: 49.9 },
  { name: 'Trimestral', description: 'Três meses com 12% de desconto no mês.', price: 339.9, billingCycle: 'QUARTERLY', enrollmentFee: 0 },
  { name: 'Anual Fidelidade', description: 'O ano inteiro pelo menor preço: R$ 99 por mês.', price: 1188, billingCycle: 'ANNUAL', enrollmentFee: 0, contractCycles: 1 },
] as const;

/** [nome, telefone, plano (índice em PLANOS), começou há N dias] */
const ALUNOS: [string, string, number, number][] = [
  ['Ana Beatriz Souza', '11 98231-4407', 0, 18],
  ['Lucas Ferreira', '11 97412-0983', 1, 35],
  ['Mariana Alves', '11 99107-5520', 2, 120],
  ['Rodrigo Nascimento', '11 98654-3312', 0, 9],
  ['Juliana Prado', '11 97788-2146', 1, 64],
  ['Felipe Cardoso', '11 99345-8871', 0, 26],
  ['Camila Ribeiro', '11 98012-6634', 2, 210],
  ['Gustavo Pereira', '11 96523-1190', 0, 3],
  ['Patrícia Moreira', '11 98876-4021', 1, 12],
  ['Diego Ramos', '11 97341-5568', 0, 40],     // mensalidade vencida há 10 dias → inadimplente
  ['Larissa Teixeira', '11 99634-7712', 0, 22], // pausada (viagem)
  ['Bruno Henrique Dias', '11 98190-3345', 1, 80], // cancelada (mudou de cidade)
];

export interface Academia { planos: any[]; alunos: Record<string, any>; matriculas: Record<string, any>; turmas: any[]; dispositivos: any[] }

export async function semearAcademia(emp: Empresa): Promise<Academia> {
  // A API local é dividida com outras gravações: 429 do limite global por IP espera e tenta de novo.
  const api: Empresa['api'] = async (method, path, data) => {
    for (let i = 0; ; i++) {
      try { return await emp.api(method, path, data); } catch (err) {
        if (i >= 8 || !/→ 429 /.test(String(err))) throw err;
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };
  const e = { ...emp, api };
  const planos: any[] = [];
  for (const p of PLANOS) planos.push(await e.api('POST', '/m/academia/planos', { ...p, accessRules: { maxCheckInsPerDay: 2 } }));

  // Alunos e adesões pagas: a matrícula nasce do pedido COMPLETED (taxa de adesão + 1º período).
  const alunos: Record<string, any> = {};
  const metodos = ['PIX', 'CREDIT', 'DEBIT', 'CASH'];
  for (const [i, [name, phone, pl, dias]] of ALUNOS.entries()) {
    const c = await e.api('POST', '/customers', { name, phone });
    alunos[name] = c;
    const plano = PLANOS[pl];
    const total = Number((plano.price + plano.enrollmentFee).toFixed(2));
    const o = await e.api('POST', '/orders', { channel: 'SUBSCRIPTION', customerId: c.id, items: [], payments: [{ method: metodos[i % metodos.length], amount: total }], moduleData: { planId: planos[pl].id, startDate: atras(dias) } });
    if (o.status !== 'COMPLETED') throw new Error(`adesão de ${name} não fechou: ${o.status}`);
  }
  // Ainda sem plano: é quem faz a adesão na frente da câmera.
  alunos['Vanessa Castro'] = await e.api('POST', '/customers', { name: 'Vanessa Castro', phone: '11 98447-2619' });
  const matriculas: Record<string, any> = {};
  for (const m of await e.api<any[]>('GET', '/m/academia/matriculas')) matriculas[m.customer.name] = m;

  // Cobrança recorrente: o job gera a mensalidade vencida do Diego e marca a inadimplência.
  await e.api('POST', '/m/academia/matriculas/rodar-cobranca');
  await e.api('POST', `/m/academia/matriculas/${matriculas['Larissa Teixeira'].id}/pausar`, { until: new Date(Date.now() + 20 * DIA).toISOString().slice(0, 10) });
  await e.api('POST', `/m/academia/matriculas/${matriculas['Bruno Henrique Dias'].id}/cancelar`, { reason: 'Mudou de cidade' });

  // Catraca e credenciais: aparelhos com token, credencial de cada aluno, acessos já ocorridos.
  const dispositivos = [
    await e.api('POST', '/m/academia/dispositivos', { name: 'Catraca da entrada', kind: 'TURNSTILE', provider: 'controlid' }),
    await e.api('POST', '/m/academia/dispositivos', { name: 'Leitor biométrico', kind: 'BIOMETRIC', provider: 'hikvision' }),
    await e.api('POST', '/m/academia/dispositivos', { name: 'Leitor QR do app', kind: 'QR_READER', provider: 'webhook' }),
  ];
  const creds: [string, 'CARD' | 'QR' | 'BIOMETRIC', number][] = [
    ['Mariana Alves', 'BIOMETRIC', 1], ['Lucas Ferreira', 'CARD', 0], ['Camila Ribeiro', 'QR', 2], ['Juliana Prado', 'CARD', 0],
    ['Felipe Cardoso', 'BIOMETRIC', 1], ['Diego Ramos', 'CARD', 0], ['Patrícia Moreira', 'QR', 2],
  ];
  const valor = (nome: string, kind: string) => `${kind}-${alunos[nome].id.slice(0, 8)}`;
  for (const [nome, kind] of creds) await e.api('POST', '/m/academia/credenciais', { customerId: alunos[nome].id, kind, value: valor(nome, kind) });
  const catraca = async (dev: any, kind: string, value: string): Promise<void> => {
    const r = await fetch(`${API}${dev.webhookUrl}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: dev.webhookToken, kind, value }) });
    if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 4000)); return catraca(dev, kind, value); }
    if (!r.ok) throw new Error(`catraca ${dev.name} → ${r.status} ${await r.text()}`);
  };
  for (const [nome, kind, d] of creds) await catraca(dispositivos[d], kind, valor(nome, kind));
  await catraca(dispositivos[0], 'CARD', '0004417790'); // cartão que não é de ninguém

  // Check-ins da recepção (manual): presentes agora.
  for (const nome of ['Rodrigo Nascimento', 'Gustavo Pereira']) await e.api('POST', '/m/academia/checkins', { customerId: alunos[nome].id });

  // Turmas com instrutor, sessões da semana e reservas.
  const instrutor = async (name: string) => e.api('POST', '/users', { name, email: `${name.split(' ')[0].toLowerCase()}@${e.slug}.local`, password: 'Instrutor-2026' });
  const thiago = await instrutor('Thiago Mendes');
  const camila = await instrutor('Camila Duarte');
  const renata = await instrutor('Renata Lopes');
  const turmas = [
    await e.api('POST', '/m/academia/turmas', { name: 'Spinning', instructorUserId: thiago.id, capacity: 16, durationMin: 45, schedule: [{ weekday: 1, time: '18:30' }, { weekday: 3, time: '18:30' }, { weekday: 5, time: '18:30' }] }),
    await e.api('POST', '/m/academia/turmas', { name: 'Pilates Solo', instructorUserId: camila.id, capacity: 10, durationMin: 50, schedule: [{ weekday: 2, time: '07:00' }, { weekday: 4, time: '07:00' }] }),
    await e.api('POST', '/m/academia/turmas', { name: 'Treino Funcional', instructorUserId: thiago.id, capacity: 20, durationMin: 45, schedule: [{ weekday: 2, time: '19:30' }, { weekday: 4, time: '19:30' }] }),
    await e.api('POST', '/m/academia/turmas', { name: 'Yoga', instructorUserId: renata.id, capacity: 12, durationMin: 60, schedule: [{ weekday: 6, time: '09:00' }] }),
  ];
  await e.api('POST', '/m/academia/turmas/gerar-sessoes?dias=7');
  const agenda = await e.api<any[]>('GET', '/m/academia/agenda');
  const reservam = ['Ana Beatriz Souza', 'Lucas Ferreira', 'Mariana Alves', 'Juliana Prado', 'Felipe Cardoso', 'Camila Ribeiro', 'Patrícia Moreira', 'Rodrigo Nascimento', 'Gustavo Pereira'];
  for (const [i, s] of agenda.entries()) {
    const n = [7, 4, 11, 6, 9, 3, 8][i % 7];
    for (let k = 0; k < Math.min(n, s.capacity, reservam.length); k++) {
      await e.api('POST', `/m/academia/agenda/${s.id}/reservas`, { customerId: alunos[reservam[(k + i) % reservam.length]].id });
    }
  }
  return { planos, alunos, matriculas, turmas, dispositivos };
}
