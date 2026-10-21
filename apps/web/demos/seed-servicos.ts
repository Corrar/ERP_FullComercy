// demos/seed-servicos.ts — dados de exemplo da oficina "Auto Center Silva", pela API (o mesmo
// caminho do cliente): clientes com carro e placa, peças com estoque, serviços de catálogo,
// técnicos, OS espalhadas pelo painel, OS já entregues (alimentam os relatórios) e a agenda.
import type { Empresa } from './_gravador';

export const PECAS = [
  { name: 'Óleo Motor 5W30 Sintético 1L', sku: 'OLE-5W30', salePrice: 48.9, costPrice: 29, estoque: 60 },
  { name: 'Filtro de Óleo', sku: 'FIL-OLEO', salePrice: 34.9, costPrice: 15, estoque: 25 },
  { name: 'Filtro de Ar do Motor', sku: 'FIL-AR', salePrice: 52.9, costPrice: 24, estoque: 18 },
  { name: 'Pastilha de Freio Dianteira (jogo)', sku: 'PAS-DIA', salePrice: 189.9, costPrice: 95, estoque: 12 },
  { name: 'Fluido de Freio DOT 4 500ml', sku: 'FLU-DOT4', salePrice: 39.9, costPrice: 18, estoque: 20 },
  { name: 'Jogo de Velas de Ignição', sku: 'VEL-JOG', salePrice: 129.9, costPrice: 64, estoque: 10 },
  { name: 'Amortecedor Dianteiro', sku: 'AMO-DIA', salePrice: 389.9, costPrice: 210, estoque: 8 },
  { name: 'Palheta Limpador (par)', sku: 'PAL-PAR', salePrice: 69.9, costPrice: 30, estoque: 15 },
];

/** O módulo já nasce com 4 serviços (onEnable); estes completam o balcão da oficina. */
const SERVICOS_EXTRA = [
  { name: 'Troca de pastilhas de freio', defaultPrice: 110, estimatedMinutes: 60 },
  { name: 'Higienização do ar-condicionado', defaultPrice: 140, estimatedMinutes: 45 },
  { name: 'Troca de amortecedores (par)', defaultPrice: 260, estimatedMinutes: 120 },
  { name: 'Troca de velas de ignição', defaultPrice: 90, estimatedMinutes: 40 },
];

/** Dono + carro. A placa é a chave de tudo na oficina. */
const FROTA = [
  { cliente: 'Ricardo Almeida', phone: '11 98432-1176', plate: 'RTA2E47', brand: 'Fiat', model: 'Argo', year: 2021, color: 'Prata', mileage: 48210 },
  { cliente: 'Luciana Ferreira', phone: '11 97215-8830', plate: 'FKQ8B31', brand: 'Volkswagen', model: 'Gol', year: 2018, color: 'Branco', mileage: 92330 },
  { cliente: 'Marcos Vinícius Rocha', phone: '11 99604-2217', plate: 'QWE4F19', brand: 'Honda', model: 'Civic', year: 2020, color: 'Preto', mileage: 61500 },
  { cliente: 'Aline Barbosa', phone: '11 98877-5402', plate: 'GHT7C52', brand: 'Chevrolet', model: 'Onix', year: 2022, color: 'Vermelho', mileage: 31870 },
  { cliente: 'José Carlos Pereira', phone: '11 96541-3398', plate: 'BRA3D08', brand: 'Toyota', model: 'Corolla', year: 2019, color: 'Cinza', mileage: 78900 },
  { cliente: 'Tatiane Ribeiro', phone: '11 97730-6125', plate: 'PLM9A64', brand: 'Hyundai', model: 'HB20', year: 2021, color: 'Azul', mileage: 43120 },
  { cliente: 'Eduardo Nogueira', phone: '11 99128-4470', plate: 'SDF1G83', brand: 'Jeep', model: 'Renegade', year: 2020, color: 'Verde', mileage: 67450 },
  { cliente: 'Camila Duarte', phone: '11 98056-7713', plate: 'KJH5B26', brand: 'Renault', model: 'Kwid', year: 2023, color: 'Branco', mileage: 18300 },
  { cliente: 'Ricardo Almeida', phone: '11 98432-1176', plate: 'MNB6H71', brand: 'Ford', model: 'Ka', year: 2017, color: 'Preto', mileage: 104200 },
  { cliente: 'Fernando Costa', phone: '11 99341-2088', plate: 'PXN4C19', brand: 'Volkswagen', model: 'T-Cross', year: 2022, color: 'Cinza', mileage: 27640 },
  { cliente: 'Beatriz Mendes', phone: '11 97602-5519', plate: 'LTR8D52', brand: 'Fiat', model: 'Toro', year: 2021, color: 'Branco', mileage: 55210 },
  { cliente: 'Gustavo Lima', phone: '11 98190-7734', plate: 'HZK2E36', brand: 'Nissan', model: 'Kicks', year: 2020, color: 'Prata', mileage: 63980 },
];

const TECNICOS = ['Rogério Alves', 'Diego Santos', 'Thiago Moreira'];

type Etapa = 'RECEIVED' | 'DIAGNOSING' | 'AWAITING_APPROVAL' | 'APPROVED' | 'AWAITING_PARTS' | 'IN_SERVICE' | 'QUALITY_CHECK' | 'READY' | 'DELIVERED';
interface OsPlano { plate: string; etapa: Etapa; tecnico?: number; relato: string; laudo?: string; servicos: string[]; pecas?: [string, number][]; pagamento?: 'PIX' | 'CREDIT' | 'DEBIT' }

/** OS já ENTREGUES (quitadas): é delas que saem o faturamento por técnico e por serviço. */
const ENTREGUES: OsPlano[] = [
  { plate: 'MNB6H71', etapa: 'DELIVERED', tecnico: 0, relato: 'Troca de óleo vencida', servicos: ['Troca de óleo e filtro'], pecas: [['OLE-5W30', 4], ['FIL-OLEO', 1]], pagamento: 'PIX' },
  { plate: 'KJH5B26', etapa: 'DELIVERED', tecnico: 1, relato: 'Volante puxando para a direita', servicos: ['Alinhamento e balanceamento'], pagamento: 'DEBIT' },
  { plate: 'FKQ8B31', etapa: 'DELIVERED', tecnico: 0, relato: 'Revisão de óleo', servicos: ['Troca de óleo e filtro'], pecas: [['OLE-5W30', 4], ['FIL-OLEO', 1]], pagamento: 'PIX' },
  { plate: 'GHT7C52', etapa: 'DELIVERED', tecnico: 2, relato: 'Freio chiando', servicos: ['Revisão de freios', 'Troca de pastilhas de freio'], pecas: [['PAS-DIA', 1], ['FLU-DOT4', 1]], pagamento: 'CREDIT' },
  { plate: 'QWE4F19', etapa: 'DELIVERED', tecnico: 1, relato: 'Motor falhando na partida', servicos: ['Diagnóstico eletrônico', 'Troca de velas de ignição'], pecas: [['VEL-JOG', 1]], pagamento: 'CREDIT' },
  { plate: 'PLM9A64', etapa: 'DELIVERED', tecnico: 2, relato: 'Cheiro ruim no ar-condicionado', servicos: ['Higienização do ar-condicionado'], pagamento: 'PIX' },
  { plate: 'RTA2E47', etapa: 'DELIVERED', tecnico: 0, relato: 'Revisão antes de viagem', servicos: ['Troca de óleo e filtro', 'Alinhamento e balanceamento'], pecas: [['OLE-5W30', 4], ['FIL-OLEO', 1], ['FIL-AR', 1]], pagamento: 'CREDIT' },
  { plate: 'SDF1G83', etapa: 'DELIVERED', tecnico: 2, relato: 'Batida seca na suspensão', servicos: ['Troca de amortecedores (par)'], pecas: [['AMO-DIA', 2]], pagamento: 'CREDIT' },
  { plate: 'BRA3D08', etapa: 'DELIVERED', tecnico: 1, relato: 'Troca de óleo', servicos: ['Troca de óleo e filtro'], pecas: [['OLE-5W30', 4], ['FIL-OLEO', 1]], pagamento: 'DEBIT' },
];

/** OS em andamento: enchem o painel, uma ou duas por coluna. A do Gol (FKQ8B31) espera aprovação. */
const EM_ANDAMENTO: OsPlano[] = [
  { plate: 'KJH5B26', etapa: 'RECEIVED', relato: 'Barulho ao passar em lombada', servicos: ['Diagnóstico eletrônico'] },
  { plate: 'MNB6H71', etapa: 'RECEIVED', relato: 'Revisão dos 100 mil km', servicos: ['Diagnóstico eletrônico'] },
  { plate: 'QWE4F19', etapa: 'DIAGNOSING', tecnico: 1, relato: 'Luz da injeção acesa no painel', servicos: ['Diagnóstico eletrônico'] },
  { plate: 'FKQ8B31', etapa: 'AWAITING_APPROVAL', tecnico: 0, relato: 'Freio rangendo e pedal baixo', laudo: 'Pastilhas dianteiras no limite e fluido de freio contaminado.', servicos: ['Revisão de freios', 'Troca de pastilhas de freio'], pecas: [['PAS-DIA', 1], ['FLU-DOT4', 1]] },
  { plate: 'SDF1G83', etapa: 'AWAITING_APPROVAL', tecnico: 2, relato: 'Ruído na roda dianteira', laudo: 'Amortecedores dianteiros com vazamento.', servicos: ['Troca de amortecedores (par)'], pecas: [['AMO-DIA', 2]] },
  { plate: 'BRA3D08', etapa: 'APPROVED', tecnico: 1, relato: 'Revisão dos 80 mil km', laudo: 'Revisão preventiva com troca de filtros.', servicos: ['Troca de óleo e filtro'], pecas: [['OLE-5W30', 4], ['FIL-OLEO', 1], ['FIL-AR', 1]] },
  { plate: 'PLM9A64', etapa: 'AWAITING_PARTS', tecnico: 2, relato: 'Motor engasgando', laudo: 'Velas desgastadas.', servicos: ['Troca de velas de ignição'], pecas: [['VEL-JOG', 1]] },
  { plate: 'GHT7C52', etapa: 'IN_SERVICE', tecnico: 2, relato: 'Volante tremendo acima de 80 km/h', laudo: 'Rodas desbalanceadas.', servicos: ['Alinhamento e balanceamento'] },
  { plate: 'RTA2E47', etapa: 'READY', tecnico: 0, relato: 'Ar-condicionado fraco', laudo: 'Filtro de cabine saturado.', servicos: ['Higienização do ar-condicionado'], pecas: [['PAL-PAR', 1]], pagamento: 'PIX' },
];

export interface Oficina { clientes: Record<string, any>; veiculos: Record<string, any>; tecnicos: any[]; os: Record<string, any>; agenda: any[] }

/** Outros roteiros gravam ao mesmo tempo contra a mesma API (limite global de 600/min por IP):
 *  um 429 espera a janela e tenta de novo, em vez de derrubar a semeadura no meio. */
function comFolego(e: Empresa): Empresa {
  const api: Empresa['api'] = async (method, path, data) => {
    for (let i = 0; ; i++) {
      try { return await e.api(method, path, data); } catch (err) {
        if (i >= 6 || !/→ 429 /.test(String(err))) throw err;
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }
  };
  return { ...e, api };
}

export async function semearServicos(empresa: Empresa): Promise<Oficina> {
  const e = comFolego(empresa);
  for (const p of PECAS) {
    const prod = await e.api('POST', '/products', { name: p.name, sku: p.sku, salePrice: p.salePrice, costPrice: p.costPrice, trackStock: true });
    await e.api('POST', '/stock/movements', { variantId: prod.variants[0].id, kind: 'RECEIVE', quantity: p.estoque, note: 'estoque inicial' });
  }
  for (const s of SERVICOS_EXTRA) await e.api('POST', '/m/servicos/catalogo', s);
  const catalogo: any[] = await e.api('GET', '/m/servicos/catalogo');
  const preco = (nome: string) => {
    const c = catalogo.find((x) => x.name === nome);
    if (!c) throw new Error(`serviço fora do catálogo: ${nome}`);
    return Number(c.defaultPrice);
  };

  const tecnicos = [];
  for (const nome of TECNICOS) {
    const email = `${nome.split(' ')[0].normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}@${e.slug}.local`;
    tecnicos.push(await e.api('POST', '/users', { name: nome, email, password: 'Oficina-tecnico-123' }));
  }

  const clientes: Record<string, any> = {};
  const veiculos: Record<string, any> = {};
  for (const f of FROTA) {
    clientes[f.cliente] ??= await e.api('POST', '/customers', { name: f.cliente, phone: f.phone });
    veiculos[f.plate] = await e.api('POST', '/m/servicos/veiculos', { customerId: clientes[f.cliente].id, plate: f.plate, brand: f.brand, model: f.model, year: f.year, color: f.color, mileage: f.mileage });
  }

  const os: Record<string, any> = {};
  const abrir = async (p: OsPlano) => {
    const v = veiculos[p.plate];
    const f = FROTA.find((x) => x.plate === p.plate)!;
    const order = await e.api('POST', '/orders', {
      channel: 'WORKSHOP', customerId: v.customerId,
      items: [
        ...p.servicos.map((s) => ({ kind: 'SERVICE', description: s, quantity: 1, unitPrice: preco(s) })),
        ...(p.pecas ?? []).map(([code, quantity]) => ({ code, quantity })),
      ],
      moduleData: { vehicleId: v.id, mileageIn: f.mileage, fuelLevel: '1/2', complaint: p.relato, technicianUserId: p.tecnico == null ? undefined : tecnicos[p.tecnico].id },
    });
    const id = order.serviceOrder.id;
    const mover = (to: string) => e.api('POST', `/m/servicos/os/${id}/mover`, { to });
    const passos: Etapa[] = ['DIAGNOSING', 'AWAITING_APPROVAL', 'APPROVED', 'IN_SERVICE', 'READY', 'DELIVERED'];
    const alvo = p.etapa === 'AWAITING_PARTS' ? 'APPROVED' : p.etapa === 'QUALITY_CHECK' ? 'IN_SERVICE' : p.etapa;
    for (const passo of passos.slice(0, passos.indexOf(alvo as Etapa) + 1)) {
      if (passo === 'AWAITING_APPROVAL') await e.api('POST', `/m/servicos/os/${id}/orcamento`, { diagnosis: p.laudo ?? 'Serviço conforme solicitado pelo cliente.' });
      else if (passo === 'APPROVED') await e.api('POST', `/m/servicos/os/${id}/aprovar`, { aprovadoPor: f.cliente, canal: 'WhatsApp' });
      else if (passo === 'DELIVERED') {
        await e.api('POST', `/orders/${order.id}/payments`, { payments: [{ method: p.pagamento ?? 'PIX', amount: Number(order.total) }] });
        await mover('DELIVERED');
      } else await mover(passo);
    }
    if (p.etapa === 'AWAITING_PARTS') await mover('AWAITING_PARTS');
    if (p.etapa === 'QUALITY_CHECK') await mover('QUALITY_CHECK');
    if (p.etapa === 'READY' && p.pagamento) await e.api('POST', `/orders/${order.id}/payments`, { payments: [{ method: p.pagamento, amount: Number(order.total) }] });
    os[`${p.plate}:${p.etapa}`] = { ...order, serviceOrderId: id };
  };
  for (const p of ENTREGUES) await abrir(p);
  for (const p of EM_ANDAMENTO) await abrir(p);

  // Agenda dos próximos dias, já confirmada com o cliente (a capacidade padrão é de 2 boxes).
  const dia = (n: number, h: number, m = 0) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const marcar: [string, string, number, string][] = [
    ['PXN4C19', dia(1, 8), 60, 'Revisão dos 30 mil km'],
    ['LTR8D52', dia(1, 9, 30), 90, 'Troca de pastilhas de freio'],
    ['HZK2E36', dia(1, 14), 60, 'Alinhamento e balanceamento'],
    ['RTA2E47', dia(2, 8, 30), 45, 'Troca de óleo e filtro'],
    ['QWE4F19', dia(2, 13), 45, 'Higienização do ar-condicionado'],
    ['PLM9A64', dia(3, 10), 60, 'Revisão de freios'],
  ];
  const agenda = [];
  for (const [plate, scheduledAt, durationMin, service] of marcar) {
    const v = veiculos[plate];
    const a = await e.api('POST', '/m/servicos/agenda', { customerId: v.customerId, vehicleId: v.id, scheduledAt, durationMin, service });
    agenda.push(await e.api('PATCH', `/m/servicos/agenda/${a.id}`, { status: 'CONFIRMED' }));
  }
  return { clientes, veiculos, tecnicos, os, agenda };
}
