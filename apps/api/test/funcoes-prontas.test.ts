// test/funcoes-prontas.test.ts — nada se vende pela metade. Para cada função do catálogo da loja:
//   • toda chave que ela libera é cobrada por alguma rota da API (senão a função não faz nada);
//   • toda função OPCIONAL tem onde ser usada no front: um item de menu com uma chave dela, ou uma
//     tela declarada aqui (a função mora dentro de outra tela). Função nova sem tela derruba o teste.
// O e2e `funcoes-prontas` prova o resto: contratar no meio do caminho e a função já responder.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET ??= '0123456789abcdef0123456789abcdef';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp, MOUNTED_ROUTES } from '../src/app';
import { FEATURES } from '../src/core/billing/catalog';

/** Chaves conferidas DENTRO do service (não por rota): o service decide o que mostrar. */
const CONFERIDAS_NO_SERVICE: Record<string, string> = {
  'cli.prontuario:view': 'clinica.service fichaDoPaciente: o prontuário só vem para quem pode ver',
};

/** Funções sem item de menu próprio: moram dentro de uma tela que já existe. */
const DENTRO_DE_OUTRA_TELA: Record<string, string> = {
  'cli.prontuario': 'Clínica → Pacientes → ficha do paciente (anamnese, evolução)',
  'hot.governanca': 'Hotelaria → Recepção (painel dos quartos: limpo / em manutenção)',
  'svc.veiculos': 'Serviços → Veículos (cadastrar e editar; a lista vem com a OS)',
};

const WEB = join(__dirname, '../../web/src');
function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
}
/** Chaves de permissão dos itens de menu do front (núcleo, administração e cada módulo). */
function chavesDoMenu(): Set<string> {
  const out = new Set<string>();
  for (const f of arquivos(WEB)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\{\s*to:\s*'[^']+',\s*label:\s*'[^']+',\s*perm:\s*'([^']+)'\s*\}/g)) out.add(m[1]);
  }
  return out;
}

test('toda chave de toda função é cobrada por alguma rota (função que não faz nada não se vende)', () => {
  buildApp();
  const cobradas = new Set(MOUNTED_ROUTES.map((r) => r.permission).filter(Boolean));
  const soltas = FEATURES.flatMap((f) => f.permissions.filter((p) => !cobradas.has(p) && !CONFERIDAS_NO_SERVICE[p]).map((p) => `${f.key}: ${p}`));
  assert.deepEqual(soltas, []);
  // A lista de exceções não pode mentir: a chave tem de existir e não ter rota (senão sai da lista).
  for (const p of Object.keys(CONFERIDAS_NO_SERVICE)) {
    assert.ok(FEATURES.some((f) => f.permissions.includes(p)), `${p} não existe no catálogo`);
    assert.ok(!cobradas.has(p), `${p} já tem rota: tire de CONFERIDAS_NO_SERVICE`);
  }
});

test('toda função opcional tem tela no front (menu próprio ou tela declarada)', () => {
  const menu = chavesDoMenu();
  assert.ok(menu.size > 30, `leitura do menu falhou (${menu.size} chaves)`);
  const semTela = FEATURES.filter((f) => !f.required && !f.permissions.some((p) => menu.has(p)) && !DENTRO_DE_OUTRA_TELA[f.key]).map((f) => `${f.key} (${f.label})`);
  assert.deepEqual(semTela, [], 'função vendida sem tela');
  for (const k of Object.keys(DENTRO_DE_OUTRA_TELA)) {
    const f = FEATURES.find((x) => x.key === k);
    assert.ok(f, `${k} não existe no catálogo`);
    assert.ok(!f!.permissions.some((p) => menu.has(p)), `${k} já tem item de menu: tire de DENTRO_DE_OUTRA_TELA`);
  }
});
