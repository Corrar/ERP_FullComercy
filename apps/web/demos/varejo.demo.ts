// demos/varejo.demo.ts — roteiros das funções do Varejo (um vídeo por chave do catálogo).
import { empresa, expect, test } from './_gravador';
import { semearVarejo } from './seeds';

const loja = (request: Parameters<typeof empresa>[0]) => empresa(request, 'VAREJO', async (e) => { await semearVarejo(e); });

test('varejo.pdv', async ({ request, gravar }) => {
  const e = await loja(request);
  const g = await gravar('varejo.pdv', e, '/varejo/pdv');
  const bipe = g.page.getByPlaceholder(/Bipe o código/);
  await expect(bipe).toBeVisible();
  await g.inicio();
  await g.pausa(700);
  await g.digitar(bipe, '7891000100011'); await bipe.press('Enter');
  await expect(g.page.getByText('Camiseta Básica Algodão')).toBeVisible();
  await g.pausa(500);
  await g.digitar(bipe, '7891000100042'); await bipe.press('Enter');
  await expect(g.page.getByText('Boné Aba Curva')).toBeVisible();
  await g.pausa(700);
  g.capa();
  await g.clicar(g.page.locator('.card:has-text("Pagamento") button:has-text("+")'));
  await g.pausa(600);
  await g.clicar(g.page.getByRole('button', { name: /Finalizar venda/ }));
  await expect(g.page.locator('.toast')).toHaveText(/Venda #\d+ concluída/);
  await g.pausa(1400);
});
