// e2e/modulos-novos.spec.ts — a jornada principal de cada módulo novo, no navegador, contra a API.
import { test, expect } from '@playwright/test';
import { API, apiLogin, run, uiLogin } from './_helpers';

const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

test('beleza: agenda → atender → comanda recebida e concluída', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'salao-demo');
  await (await request.post(`${API}/m/beleza/profissionais`, { headers: h, data: { name: `Bia ${run}`, commissionRate: 30 } })).json();
  await request.post(`${API}/m/beleza/servicos`, { headers: h, data: { name: `Escova ${run}`, durationMin: 30, price: 70 } });
  await request.post(`${API}/customers`, { headers: h, data: { name: `Cliente B ${run}` } });

  await uiLogin(page, 'salao-demo');
  await page.goto('/beleza/agenda');
  await page.getByRole('button', { name: 'Agendar' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Buscar cliente').fill(`Cliente B ${run}`);
  await dlg.getByRole('button', { name: new RegExp(`^Cliente B ${run}`) }).click();
  await dlg.locator('label:has-text("Profissional") select').selectOption({ label: `Bia ${run}` });
  await dlg.locator('label:has-text("Serviço") select').selectOption({ label: `Escova ${run} · 30 min` });
  await dlg.locator('input[type=time]').fill('22:30');
  await dlg.getByRole('button', { name: 'Agendar' }).click();
  const coluna = page.locator('.card', { has: page.getByRole('heading', { name: `Bia ${run}` }) });
  await expect(coluna.getByText(`Cliente B ${run}`)).toBeVisible();
  await coluna.getByRole('button', { name: 'Atender' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Abrir comanda' }).click();
  await expect(page).toHaveURL(/\/beleza\/comandas\?o=/);
  await expect(page.getByText(`Escova ${run}`).first()).toBeVisible();
  await page.getByRole('button', { name: 'Receber' }).click();
  await expect(page.locator('.card:has-text("Comanda #")').getByText('Concluído')).toBeVisible();
});

test('pet: banho até pronto → cobrar e entregar no balcão', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'pet-demo');
  const tutor = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Tutor UI ${run}` } })).json();
  const pet = await (await request.post(`${API}/m/pet/pets`, { headers: h, data: { customerId: tutor.id, name: `Thor ${run}`, species: 'CAO', size: 'G' } })).json();
  await request.post(`${API}/m/pet/banho-tosa`, { headers: h, data: { petId: pet.id, scheduledAt: new Date(`${hojeISO()}T23:00:00`).toISOString(), services: 'Banho completo', price: 85 } });

  await uiLogin(page, 'pet-demo');
  await page.goto('/pet/banho-tosa');
  const linha = page.locator('tr', { hasText: `Thor ${run}` });
  await linha.getByRole('button', { name: 'Começar' }).click();
  await linha.getByRole('button', { name: 'Pronto' }).click();
  await linha.getByRole('button', { name: 'Cobrar e entregar' }).click();
  await expect(page).toHaveURL(/\/pet\/balcao\?o=/);
  await expect(page.getByText('Banho/tosa: Banho completo')).toBeVisible();
  await page.getByRole('button', { name: 'Receber' }).click();
  await expect(page.locator('.card:has-text("Venda #")').getByText('Concluído')).toBeVisible();
  await page.goto(`/pet/pets/${pet.id}`);
  await expect(page.locator('.card:has-text("Banho e tosa")').getByText('Entregue')).toBeVisible();
});

test('clínica: agenda particular → chegou → cobrar → recibo', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'clinica-demo');
  await request.post(`${API}/m/clinica/profissionais`, { headers: h, data: { name: `Dr. Rui ${run}`, specialty: 'Pediatria', registry: 'CRM 9', defaultPrice: 200 } });
  await request.post(`${API}/customers`, { headers: h, data: { name: `Paciente UI ${run}` } });

  await uiLogin(page, 'clinica-demo');
  await page.goto('/clinica/agenda');
  await page.getByRole('button', { name: 'Agendar' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Buscar paciente').fill(`Paciente UI ${run}`);
  await dlg.getByRole('button', { name: new RegExp(`^Paciente UI ${run}`) }).click();
  await dlg.locator('label:has-text("Profissional") select').selectOption({ label: `Dr. Rui ${run}` });
  await dlg.locator('input[type=time]').fill('22:00');
  await dlg.getByRole('button', { name: 'Agendar' }).click();
  const coluna = page.locator('.card', { has: page.getByRole('heading', { name: new RegExp(`Dr\\. Rui ${run}`) }) });
  await expect(coluna.getByText(`Paciente UI ${run}`)).toBeVisible();
  await coluna.getByRole('button', { name: 'Chegou' }).click();
  await coluna.getByRole('button', { name: 'Cobrar' }).click();
  const cobranca = page.getByRole('dialog');
  await expect(cobranca.getByText(/Consulta — Dr\. Rui/)).toBeVisible();
  await cobranca.getByRole('button', { name: 'Receber' }).click();
  await expect(cobranca.getByText('Concluído')).toBeVisible();
  await page.keyboard.press('Escape');
  await coluna.getByRole('button', { name: 'Recibo' }).click();
  await expect(page.getByText(`Recebi de Paciente UI ${run}`)).toBeVisible();
  await expect(page.getByText(/CRM 9/)).toBeVisible();
});

test('hotelaria: check-in na recepção → conta com diárias → recebe → check-out → limpeza', async ({ page, request }) => {
  const { h } = await apiLogin(request, 'pousada-demo');
  const numero = `U${Date.now() % 100000}`;
  const quarto = await (await request.post(`${API}/m/hotel/quartos`, { headers: h, data: { number: numero, type: 'Standard', capacity: 2, dailyRate: 180 } })).json();
  const hosp = await (await request.post(`${API}/customers`, { headers: h, data: { name: `Hóspede UI ${run}` } })).json();
  const amanha = new Date(Date.now() + 86400000 * 2 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  await request.post(`${API}/m/hotel/reservas`, { headers: h, data: { customerId: hosp.id, roomId: quarto.id, checkIn: hojeISO(), checkOut: amanha } });

  await uiLogin(page, 'pousada-demo');
  await page.goto('/hotel/painel');
  await page.locator('.card:has-text("Chegam hoje") tr', { hasText: `Hóspede UI ${run}` }).getByRole('button', { name: 'Check-in' }).click();
  const conta = page.getByRole('dialog');
  await expect(conta.getByText(new RegExp(`Diárias quarto ${numero} \\(2 × 180\\.00\\)`))).toBeVisible();
  await conta.getByRole('button', { name: 'Receber' }).click();
  await conta.getByRole('button', { name: 'Fazer check-out' }).click();
  await expect(page.locator('.toast')).toHaveText(/Check-out feito/);
  const card = page.locator('.card', { hasText: numero }).first();
  await expect(card.getByText('Limpeza')).toBeVisible();
  await card.getByRole('button', { name: 'Limpo' }).click();
  await expect(card.getByText('Livre')).toBeVisible();
});
