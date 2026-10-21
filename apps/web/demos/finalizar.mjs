// demos/finalizar.mjs — transforma os quadros gravados (screencast, demos/.saida) no que a loja serve:
//   public/demos/<chave>.mp4  H.264, 880 px de largura, 24 fps, sem som, faststart (toca enquanto baixa);
//   public/demos/<chave>.jpg  pôster (o quadro que o roteiro marcou com `g.capa()`, ou o último);
//   src/store/demos.json      quais funções têm vídeo e quanto dura (o card não pede arquivo que não existe).
// H.264 e não webm: é o único formato que toca em todo navegador, inclusive o Safari do iPhone.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const saida = join(aqui, '.saida');
const pub = join(aqui, '..', 'public', 'demos');
const manifesto = join(aqui, '..', 'src', 'store', 'demos.json');
mkdirSync(pub, { recursive: true });

const atual = existsSync(manifesto) ? JSON.parse(readFileSync(manifesto, 'utf8')) : {};
const metas = readdirSync(saida).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(saida, f), 'utf8')));
if (!metas.length) { console.error('Nada gravado em demos/.saida — rode os roteiros antes.'); process.exit(1); }

for (const m of metas) {
  const mp4 = join(pub, `${m.chave}.mp4`);
  const jpg = join(pub, `${m.chave}.jpg`);
  // Quadros com duração variável (o screencast só manda quando a tela muda) → 24 fps constantes.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', m.lista,
    '-vf', 'scale=880:-2:flags=lanczos,fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27',
    '-profile:v', 'high', '-movflags', '+faststart', '-an', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', m.capa, '-vf', 'scale=880:-2:flags=lanczos', '-frames:v', '1', '-q:v', '5', jpg]);
  atual[m.chave] = { duracao: Number(m.duracao.toFixed(1)) };
  console.log(`${m.chave.padEnd(20)} ${m.duracao.toFixed(1).padStart(5)} s  ${(statSync(mp4).size / 1024).toFixed(0).padStart(5)} KB  pôster ${(statSync(jpg).size / 1024).toFixed(0)} KB`);
}
writeFileSync(manifesto, JSON.stringify(Object.fromEntries(Object.entries(atual).sort()), null, 2) + '\n');
console.log(`manifesto: ${Object.keys(atual).length} funções com vídeo`);
