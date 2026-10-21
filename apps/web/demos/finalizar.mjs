// demos/finalizar.mjs — transforma os quadros gravados (screencast, demos/.saida) no que a loja serve:
//   public/demos/<chave>.mp4  H.264, 880 px de largura, 24 fps, sem som, faststart (toca enquanto baixa);
//   public/demos/<chave>.webm VP9 do mesmo vídeo, para navegador sem H.264;
//   public/demos/<chave>.jpg  pôster (o quadro que o roteiro marcou com `g.capa()`, ou o último);
//   src/store/demos.json      quais funções têm vídeo, quanto dura e a versão (o card não pede arquivo que não existe).
// H.264 primeiro: é o que o Safari do iPhone toca; o <video> escolhe o primeiro formato que conhece.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const saida = join(aqui, '.saida');
const pub = join(aqui, '..', 'public', 'demos');
const manifesto = join(aqui, '..', 'src', 'store', 'demos.json');
mkdirSync(pub, { recursive: true });

const atual = existsSync(manifesto) ? JSON.parse(readFileSync(manifesto, 'utf8')) : {};
// `node demos/finalizar.mjs varejo.pdv food.salao` finaliza só essas chaves (o resto do manifesto fica).
const so = new Set(process.argv.slice(2));
const metas = readdirSync(saida).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(saida, f), 'utf8'))).filter((m) => !so.size || so.has(m.chave));
if (!metas.length) { console.error('Nada gravado em demos/.saida — rode os roteiros antes.'); process.exit(1); }

for (const m of metas) {
  const mp4 = join(pub, `${m.chave}.mp4`);
  const jpg = join(pub, `${m.chave}.jpg`);
  // Quadros com duração variável (o screencast só manda quando a tela muda) → 24 fps constantes.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', m.lista,
    '-vf', 'scale=880:-2:flags=lanczos,fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27',
    '-profile:v', 'high', '-movflags', '+faststart', '-an', mp4]);
  // WebM (VP9) ao lado: Chromium de código aberto e alguns Androids não têm H.264.
  const webm = join(pub, `${m.chave}.webm`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '2', '-an', webm]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', m.capa, '-vf', 'scale=880:-2:flags=lanczos', '-frames:v', '1', '-q:v', '5', jpg]);
  // `v` = impressão do arquivo: a URL muda a cada regravação e o cache longo da Vercel nunca serve vídeo velho.
  const v = createHash('sha1').update(readFileSync(mp4)).update(readFileSync(webm)).update(readFileSync(jpg)).digest('hex').slice(0, 10);
  atual[m.chave] = { duracao: Number(m.duracao.toFixed(1)), v };
  console.log(`${m.chave.padEnd(20)} ${m.duracao.toFixed(1).padStart(5)} s  ${(statSync(mp4).size / 1024).toFixed(0).padStart(5)} KB mp4  ${(statSync(webm).size / 1024).toFixed(0).padStart(4)} KB webm  pôster ${(statSync(jpg).size / 1024).toFixed(0)} KB`);
}
writeFileSync(manifesto, JSON.stringify(Object.fromEntries(Object.entries(atual).sort()), null, 2) + '\n');
console.log(`manifesto: ${Object.keys(atual).length} funções com vídeo`);
