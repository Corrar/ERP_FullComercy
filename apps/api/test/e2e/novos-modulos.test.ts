// test/e2e/novos-modulos.test.ts — Beleza, Pet, Clínica e Hotelaria, pela API, contra o banco real.
// Rodar: E2E=1 npm run test:e2e   (com .env apontando para um banco migrado + seed)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, start, stop, login, run } from './_harness';

/** Amanhã às HH:MM (UTC), longe de "agora" para não esbarrar em nada da rodada anterior. */
const em = (diasAFrente: number, hh: number, mm = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + diasAFrente); d.setUTCHours(hh, mm, 0, 0); return d.toISOString(); };
const dia = (diasAFrente: number) => em(diasAFrente, 12).slice(0, 10);

if (!E2E) {
  test('e2e pulado: defina E2E=1 e DATABASE_URL', { skip: true }, () => {});
} else {
  before(async () => { await start(); });
  after(async () => { await stop(); });

  // ───────────────────────────── BELEZA ─────────────────────────────
  test('Beleza: agenda sem choque → comanda com preço do cadastro → comissão → pacote (venda, uso, estorno)', async () => {
    const { api: A, me } = await login('salao-demo');
    assert.deepEqual(me.modules, ['BELEZA']);
    // Dias diferentes por rodada: o mesmo profissional novo não colide, mas o seed acumula agendas.
    const d = 3 + (Date.now() % 300);
    const ana = await A.post('/m/beleza/profissionais', { name: `Ana ${run}`, commissionRate: 40 });
    const corte = await A.post('/m/beleza/servicos', { name: `Corte ${run}`, durationMin: 60, price: 80 });
    const escova = await A.post('/m/beleza/servicos', { name: `Escova ${run}`, durationMin: 30, price: 50, commissionRate: 10 });
    const cli = await A.post('/customers', { name: `Cliente Salão ${run}` });
    const cli2 = await A.post('/customers', { name: `Outra ${run}` });

    const h1 = await A.post('/m/beleza/agenda', { customerId: cli.id, professionalId: ana.id, serviceId: corte.id, startsAt: em(d, 13) });
    assert.equal(new Date(h1.endsAt).toISOString(), em(d, 14), 'fim = início + duração do serviço');
    const choque = await A.raw('POST', '/m/beleza/agenda', { customerId: cli2.id, professionalId: ana.id, serviceId: escova.id, startsAt: em(d, 13, 30) });
    assert.equal(choque.status, 409, 'mesmo profissional, horário sobreposto');
    const encosta = await A.post('/m/beleza/agenda', { customerId: cli2.id, professionalId: ana.id, serviceId: escova.id, startsAt: em(d, 14) });
    assert.equal(encosta.status, 'SCHEDULED', 'termina 14:00 e começa 14:00 não é choque');
    await A.patch(`/m/beleza/agenda/${encosta.id}`, { status: 'NO_SHOW' });
    const reabrir = await A.raw('PATCH', `/m/beleza/agenda/${h1.id}`, { status: 'DONE' });
    assert.equal(reabrir.status, 400, 'DONE só pela comanda');

    // Comanda do atendimento: o cliente HTTP manda preço 1, vale o do cadastro (80).
    const comanda = await A.post('/orders', { channel: 'SALON', customerId: cli.id, items: [{ kind: 'SERVICE', description: 'x', unitPrice: 1, quantity: 1, metadata: { serviceId: corte.id } }], moduleData: { appointmentId: h1.id } });
    assert.equal(comanda.moduleKey, 'BELEZA');
    assert.equal(comanda.status, 'OPEN');
    assert.equal(comanda.total, '80');
    assert.equal(comanda.items[0].description, `Corte ${run}`);
    const emAtendimento = (await A.get(`/m/beleza/agenda?from=${em(d, 0)}&to=${em(d + 1, 0)}&professionalId=${ana.id}`)).find((a: any) => a.id === h1.id);
    assert.equal(emAtendimento.status, 'IN_SERVICE');
    const deNovo = await A.raw('POST', '/orders', { channel: 'SALON', customerId: cli.id, items: [{ kind: 'SERVICE', description: 'x', unitPrice: 1, quantity: 1, metadata: { serviceId: corte.id } }], moduleData: { appointmentId: h1.id } });
    assert.equal(deNovo.status, 409, 'horário já em atendimento');
    const paga = await A.post(`/orders/${comanda.id}/payments`, { payments: [{ method: 'PIX', amount: 80 }] });
    assert.equal(paga.status, 'COMPLETED');
    let com = await A.get(`/m/beleza/comissoes?professionalId=${ana.id}`);
    assert.equal(com.length, 1);
    assert.equal(com[0].amount, '32', '40% do profissional sobre 80');

    // Pacote: 5 escovas por 200 (sessão vale 40). Vende, usa uma, estorna o uso.
    const pacote = await A.post('/m/beleza/pacotes', { name: `5 escovas ${run}`, serviceId: escova.id, sessions: 5, price: 200 });
    const venda = await A.post('/orders', { channel: 'SALON', customerId: cli.id, items: [{ kind: 'SERVICE', description: 'p', unitPrice: 1, quantity: 1, metadata: { packageId: pacote.id } }], payments: [{ method: 'PIX', amount: 200 }], moduleData: { professionalId: ana.id } });
    assert.equal(venda.status, 'COMPLETED');
    let pk = (await A.get(`/m/beleza/pacotes/cliente/${cli.id}`))[0];
    assert.equal(pk.saldo, 5);
    assert.equal((await A.get(`/m/beleza/comissoes?professionalId=${ana.id}`)).length, 1, 'venda de pacote não comissiona');

    const semServico = await A.raw('POST', '/orders', { channel: 'SALON', customerId: cli.id, items: [{ kind: 'SERVICE', description: 'x', unitPrice: 1, quantity: 1, metadata: { serviceId: corte.id } }], moduleData: { professionalId: ana.id, customerPackageId: pk.id } });
    assert.equal(semServico.status, 400, 'pacote de escova não paga corte');
    const uso = await A.post('/orders', { channel: 'SALON', customerId: cli.id, items: [{ kind: 'SERVICE', description: 'x', unitPrice: 1, quantity: 1, metadata: { serviceId: escova.id } }], moduleData: { professionalId: ana.id, customerPackageId: pk.id } });
    assert.equal(uso.total, '0');
    assert.equal(uso.status, 'COMPLETED', 'total zero conclui sem pagamento');
    pk = (await A.get(`/m/beleza/pacotes/cliente/${cli.id}`))[0];
    assert.equal(pk.saldo, 4);
    com = await A.get(`/m/beleza/comissoes?professionalId=${ana.id}`);
    assert.equal(com.length, 2);
    assert.equal(com[0].amount, '4', 'sessão comissiona pelo valor da sessão (200/5=40) × 10% do serviço');
    await A.post(`/orders/${uso.id}/cancel`, { reason: 'lançado errado' });
    assert.equal((await A.get(`/m/beleza/pacotes/cliente/${cli.id}`))[0].saldo, 5, 'estorno devolve a sessão');
    assert.equal((await A.get(`/m/beleza/comissoes?professionalId=${ana.id}&status=PENDING`)).length, 1, 'comissão do uso estornado cancela');

    const pago = await A.post('/m/beleza/comissoes/pagar', { professionalId: ana.id });
    assert.equal(pago.pagas, 1);
    assert.equal(pago.total, '32');
    const faltas = await A.get(`/m/beleza/relatorios/faltas?from=${em(d, 0)}&to=${em(d + 1, 0)}`);
    assert.ok(faltas.faltas >= 1);
    const porProf = await A.get('/m/beleza/relatorios/profissionais');
    assert.ok(porProf.some((r: any) => r.profissional === `Ana ${run}`));

    const { api: B } = await login('loja-demo');
    assert.equal((await B.raw('GET', '/m/beleza/agenda?from=2026-01-01&to=2026-01-02')).status, 403, 'módulo desligado na loja');
  });

  // ───────────────────────────── PET ─────────────────────────────
  test('Pet: ficha do pet → banho/tosa até pronto → cobrado no balcão com o preço do agendamento → vacinas e lembretes', async () => {
    const { api: A } = await login('pet-demo');
    const tutor = await A.post('/customers', { name: `Tutor ${run}` });
    const outro = await A.post('/customers', { name: `Outro Tutor ${run}` });
    const rex = await A.post('/m/pet/pets', { customerId: tutor.id, name: `Rex ${run}`, species: 'CAO', breed: 'SRD', size: 'M', weightKg: 12.5 });
    assert.equal((await A.raw('POST', '/m/pet/pets', { customerId: tutor.id, name: 'X', species: 'DRAGAO' })).status, 400);
    const busca = await A.get(`/m/pet/pets?q=${encodeURIComponent(`Tutor ${run}`)}`);
    assert.ok(busca.some((p: any) => p.id === rex.id), 'busca pelo nome do tutor acha o pet');

    const banho = await A.post('/m/pet/banho-tosa', { petId: rex.id, scheduledAt: em(1, 13), services: 'Banho + tosa higiênica', price: 70 });
    assert.equal((await A.raw('POST', `/m/pet/banho-tosa/${banho.id}/mover`, { to: 'DELIVERED' })).status, 400, 'entrega só pela venda');
    await A.post(`/m/pet/banho-tosa/${banho.id}/mover`, { to: 'IN_PROGRESS' });
    await A.post(`/m/pet/banho-tosa/${banho.id}/mover`, { to: 'READY' });
    const produto = await A.post('/products', { name: `Ração ${run}`, sku: `RAC-${run}`, salePrice: 30, trackStock: false });

    const deOutro = await A.raw('POST', '/orders', { channel: 'PETSHOP', customerId: outro.id, items: [{ kind: 'SERVICE', description: 'b', unitPrice: 1, quantity: 1, metadata: { groomingId: banho.id } }], moduleData: { groomingId: banho.id } });
    assert.equal(deOutro.status, 400, 'banho é de pet de outro tutor');
    const venda = await A.post('/orders', { channel: 'PETSHOP', customerId: tutor.id,
      items: [{ kind: 'SERVICE', description: 'b', unitPrice: 1, quantity: 1, metadata: { groomingId: banho.id } }, { variantId: produto.variants[0].id, quantity: 2 }],
      payments: [{ method: 'PIX', amount: 130 }], moduleData: { petId: rex.id, groomingId: banho.id } });
    assert.equal(venda.moduleKey, 'PET');
    assert.equal(venda.total, '130', 'banho 70 (do agendamento, não 1) + 2 rações de 30');
    assert.equal(venda.status, 'COMPLETED');
    const ficha = await A.get(`/m/pet/pets/${rex.id}`);
    assert.equal(ficha.banhos[0].status, 'DELIVERED');
    assert.equal(ficha.compras[0].number, venda.number);
    const duasVezes = await A.raw('POST', '/orders', { channel: 'PETSHOP', customerId: tutor.id, items: [{ kind: 'SERVICE', description: 'b', unitPrice: 1, quantity: 1, metadata: { groomingId: banho.id } }], moduleData: { groomingId: banho.id } });
    assert.equal(duasVezes.status, 409, 'banho já cobrado');

    // Vacina antiga vencida + reforço novo: só a dose mais recente entra nos lembretes.
    await A.post(`/m/pet/pets/${rex.id}/vacinas`, { name: 'V10', appliedAt: dia(-400), nextDueAt: dia(-35) });
    await A.post(`/m/pet/pets/${rex.id}/vacinas`, { name: 'Antirrábica', appliedAt: dia(-350), nextDueAt: dia(10) });
    let lem = await A.get('/m/pet/lembretes?dias=30');
    assert.ok(lem.vacinas.some((v: any) => v.petId === rex.id && v.name === 'V10' && v.vencida));
    assert.ok(lem.vacinas.some((v: any) => v.petId === rex.id && v.name === 'Antirrábica' && !v.vencida));
    await A.post(`/m/pet/pets/${rex.id}/vacinas`, { name: 'V10', appliedAt: dia(0), nextDueAt: dia(365) });
    lem = await A.get('/m/pet/lembretes?dias=30');
    assert.ok(!lem.vacinas.some((v: any) => v.petId === rex.id && v.name === 'V10'), 'reforço aplicado tira a V10 da lista');
    await A.post(`/m/pet/pets/${rex.id}/atendimentos`, { kind: 'CONSULTA', complaint: 'coceira', diagnosis: 'dermatite', returnAt: dia(7) });
    lem = await A.get('/m/pet/lembretes?dias=30');
    assert.ok(lem.retornos.some((r: any) => r.petId === rex.id));
    assert.ok((await A.get(`/m/pet/pets/${rex.id}`)).prontuario.length === 1);
    const resumo = await A.get('/m/pet/relatorios/resumo');
    assert.ok(resumo.porTipo.some((t: any) => t.tipo === 'Serviços'));
  });

  // ───────────────────────────── CLÍNICA ─────────────────────────────
  test('Clínica: agenda sem choque → particular paga e conclui → convênio fica a receber até o repasse → prontuário → recibo', async () => {
    const { api: A } = await login('clinica-demo');
    const d = 3 + (Date.now() % 300);
    const dra = await A.post('/m/clinica/profissionais', { name: `Dra. Lia ${run}`, specialty: 'Clínica geral', registry: 'CRM 1234', defaultDurationMin: 30, defaultPrice: 250 });
    const conv = await A.post('/m/clinica/convenios', { name: `Saúde Mais ${run}`, price: 120 });
    const pac = await A.post('/customers', { name: `Paciente ${run}`, document: `${Date.now()}`.slice(-11) });
    const pac2 = await A.post('/customers', { name: `Paciente B ${run}` });
    await A.put(`/m/clinica/pacientes/${pac2.id}/ficha`, { insuranceId: conv.id, insuranceCard: '99887766', allergies: 'dipirona' });

    const c1 = await A.post('/m/clinica/agenda', { customerId: pac.id, professionalId: dra.id, startsAt: em(d, 13) });
    assert.equal(c1.price, '250', 'particular: valor padrão da profissional');
    assert.equal((await A.raw('POST', '/m/clinica/agenda', { customerId: pac2.id, professionalId: dra.id, startsAt: em(d, 13, 15) })).status, 409);
    const c2 = await A.post('/m/clinica/agenda', { customerId: pac2.id, professionalId: dra.id, startsAt: em(d, 13, 30), payer: 'CONVENIO' });
    assert.equal(c2.price, '120', 'convênio da ficha, valor da tabela do convênio');
    assert.equal(c2.insuranceId, conv.id);

    await A.patch(`/m/clinica/agenda/${c1.id}`, { status: 'ARRIVED' });
    const linha = (a: any) => ({ kind: 'SERVICE', description: 'c', unitPrice: 1, quantity: 1, metadata: { appointmentId: a.id } });
    const p1 = await A.post('/orders', { channel: 'CLINIC', customerId: pac.id, items: [linha(c1)], payments: [{ method: 'PIX', amount: 250 }], moduleData: { appointmentId: c1.id } });
    assert.equal(p1.moduleKey, 'CLINICA');
    assert.equal(p1.status, 'COMPLETED');
    assert.match(p1.items[0].description, /^Consulta — Dra\. Lia/);
    const p2 = await A.post('/orders', { channel: 'CLINIC', customerId: pac2.id, items: [linha(c2)], moduleData: { appointmentId: c2.id } });
    assert.equal(p2.status, 'OPEN', 'convênio: a receber');
    let aReceber = await A.get(`/m/clinica/convenios-a-receber?insuranceId=${conv.id}`);
    assert.equal(aReceber.length, 1);
    assert.equal((await A.raw('PATCH', `/m/clinica/agenda/${c2.id}`, { status: 'CANCELLED' })).status, 409, 'consulta cobrada não se mexe');
    const repasse = await A.post(`/orders/${p2.id}/payments`, { payments: [{ method: 'PIX', amount: 120, reference: 'repasse lote 7' }] });
    assert.equal(repasse.status, 'COMPLETED');
    aReceber = await A.get(`/m/clinica/convenios-a-receber?insuranceId=${conv.id}`);
    assert.equal(aReceber.length, 0);

    // Retorno de valor zero conclui sem pagamento.
    const ret = await A.post('/m/clinica/agenda', { customerId: pac.id, professionalId: dra.id, startsAt: em(d + 7, 13), kind: 'RETORNO', price: 0 });
    const pr = await A.post('/orders', { channel: 'CLINIC', customerId: pac.id, items: [linha(ret)], moduleData: { appointmentId: ret.id } });
    assert.equal(pr.status, 'COMPLETED');

    await A.post(`/m/clinica/pacientes/${pac.id}/prontuario`, { professionalId: dra.id, appointmentId: c1.id, anamnesis: 'cefaleia há 3 dias', evolution: 'melhora', returnAt: dia(d + 7) });
    const ficha = await A.get(`/m/clinica/pacientes/${pac.id}`);
    assert.equal(ficha.prontuario.length, 1);
    assert.equal(ficha.consultas.length, 2);
    assert.equal((await A.raw('POST', `/m/clinica/pacientes/${pac2.id}/prontuario`, { professionalId: dra.id, appointmentId: c1.id })).status, 400, 'consulta de outro paciente');
    const rec = await A.get(`/m/clinica/recibos/${p1.id}`);
    assert.equal(rec.total, '250');
    assert.equal(rec.pago, '250.00');
    assert.equal(rec.profissional.registro, 'CRM 1234');
    const porConv = await A.get(`/m/clinica/relatorios/convenios?from=${em(-1, 0)}&to=${em(1, 0)}`);
    assert.ok(porConv.some((r: any) => r.convenio === `Saúde Mais ${run}` && r.aReceber === '0'));
  });

  // ───────────────────────────── HOTELARIA ─────────────────────────────
  test('Hotelaria: reserva sem sobreposição → check-in abre a conta com diárias → consumo → check-out só pago → limpeza', async () => {
    const { api: A } = await login('pousada-demo');
    const q = await A.post('/m/hotel/quartos', { number: `${Date.now() % 100000}`, type: 'Luxo', capacity: 2, dailyRate: 300 });
    const hosp = await A.post('/customers', { name: `Hóspede ${run}` });
    const hosp2 = await A.post('/customers', { name: `Hóspede B ${run}` });
    assert.equal((await A.raw('POST', '/m/hotel/reservas', { customerId: hosp.id, roomId: q.id, checkIn: dia(0), checkOut: dia(0) })).status, 400, 'mínimo uma diária');
    assert.equal((await A.raw('POST', '/m/hotel/reservas', { customerId: hosp.id, roomId: q.id, checkIn: dia(0), checkOut: dia(3), guests: 3 })).status, 400, 'capacidade');
    const r = await A.post('/m/hotel/reservas', { customerId: hosp.id, roomId: q.id, checkIn: dia(0), checkOut: dia(3), guests: 2 });
    assert.equal((await A.raw('POST', '/m/hotel/reservas', { customerId: hosp2.id, roomId: q.id, checkIn: dia(2), checkOut: dia(4) })).status, 409, 'sobrepõe a última noite');
    const depois = await A.post('/m/hotel/reservas', { customerId: hosp2.id, roomId: q.id, checkIn: dia(3), checkOut: dia(5) });
    assert.equal(depois.status, 'BOOKED', 'saída e entrada no mesmo dia não é choque');
    const livres = await A.get(`/m/hotel/disponiveis?checkIn=${dia(1)}&checkOut=${dia(2)}`);
    assert.ok(!livres.some((x: any) => x.id === q.id));

    const semReserva = await A.raw('POST', '/orders', { channel: 'LODGING', customerId: hosp.id, items: [] });
    assert.equal(semReserva.status, 400);
    const conta = await A.post('/orders', { channel: 'LODGING', customerId: hosp.id, items: [], moduleData: { reservationId: r.id } });
    assert.equal(conta.moduleKey, 'HOTEL');
    assert.equal(conta.total, '900', '3 diárias de 300');
    assert.equal(conta.status, 'OPEN');
    assert.equal((await A.get('/m/hotel/quartos')).find((x: any) => x.id === q.id).status, 'OCCUPIED');
    const prod = await A.post('/products', { name: `Água ${run}`, sku: `AGU-${run}`, salePrice: 8, trackStock: false });
    const comConsumo = await A.post(`/orders/${conta.id}/items`, { items: [{ variantId: prod.variants[0].id, quantity: 3 }] });
    assert.equal(comConsumo.total, '924', 'consumo entra sem diárias de novo');
    assert.equal((await A.raw('POST', `/m/hotel/reservas/${r.id}/checkout`)).status, 409, 'saldo em aberto');
    await A.post(`/orders/${conta.id}/payments`, { payments: [{ method: 'PIX', amount: 924 }] });
    assert.equal((await A.get(`/orders/${conta.id}`)).status, 'OPEN', 'pagar não fecha a conta: fecha o check-out');
    const saiu = await A.post(`/m/hotel/reservas/${r.id}/checkout`);
    assert.equal(saiu.status, 'CHECKED_OUT');
    assert.equal(saiu.room.status, 'CLEANING');
    assert.equal((await A.get(`/orders/${conta.id}`)).status, 'COMPLETED');
    assert.equal((await A.raw('POST', `/m/hotel/quartos/${q.id}/status`, { status: 'OCCUPIED' })).status, 409);
    await A.post(`/m/hotel/quartos/${q.id}/status`, { status: 'AVAILABLE' });
    const oc = await A.get(`/m/hotel/relatorios/ocupacao?from=${dia(0)}&to=${dia(3)}`);
    assert.ok(Number(oc.noitesVendidas) >= 3);
    assert.ok(Number(oc.diariaMedia) > 0);
  });
}
