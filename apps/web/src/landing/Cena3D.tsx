// Cena 3D da apresentação (three.js): as OITO peças — uma por ramo, na cor do módulo — começam
// soltas no ar e se ENCAIXAM numa grade conforme a rolagem ("o sistema montado função por
// função"). O GSAP ScrollTrigger dá o progresso (0 → 1) entre o topo da página e o fim da seção
// marcada com `data-lp-montagem`; o mouse inclina o conjunto. Movimento reduzido: quadro único, já
// montado. Sem WebGL: some (o fundo em degradê da página continua).
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MODULE_LOOK } from '@/app/module-look';

gsap.registerPlugin(ScrollTrigger);

const CORES = Object.values(MODULE_LOOK).map((m) => m.accent);
const N = CORES.length;

// Posições "soltas" determinísticas (mesma cena a cada visita, sem Math.random no render).
function semente(i: number) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
// Ficam na metade DIREITA em tela larga (o grupo é deslocado +3.4): o título não fica coberto.
const SOLTAS = CORES.map((_, i) => ({
  pos: new THREE.Vector3(semente(i) * 6.5 - 3.2, (semente(i + 11) - 0.5) * 7, (semente(i + 23) - 0.5) * 5 - 1.5),
  rot: new THREE.Euler(semente(i + 3) * Math.PI, semente(i + 5) * Math.PI, semente(i + 7) * Math.PI),
  giro: 0.15 + semente(i + 9) * 0.35,
}));

/** Grade final: 4×2 em tela larga, 2×4 em tela estreita. */
function grade(estreita: boolean) {
  const cols = estreita ? 2 : 4; const linhas = N / cols; const passo = 1.95;
  return CORES.map((_, i) => new THREE.Vector3(((i % cols) - (cols - 1) / 2) * passo, ((linhas - 1) / 2 - Math.floor(i / cols)) * passo, 0));
}

const suave = (t: number) => t * t * (3 - 2 * t);
const limitar = (v: number) => Math.min(1, Math.max(0, v));

export function Cena3D({ reduzido }: { reduzido: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setOk(false); return;
    }
    setOk(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const cena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    cena.environment = ambiente;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    cena.add(new THREE.AmbientLight(0xffffff, 0.35));
    const luz = new THREE.DirectionalLight(0xffffff, 1.6); luz.position.set(5, 8, 6); cena.add(luz);

    const conjunto = new THREE.Group(); cena.add(conjunto);
    const geo = new RoundedBoxGeometry(1.6, 1.6, 1.6, 5, 0.3);
    const materiais = CORES.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.18 }));
    const pecas = materiais.map((m) => { const p = new THREE.Mesh(geo, m); conjunto.add(p); return p; });

    // Poeira de partículas na cor da marca, girando devagar atrás das peças.
    const qtd = 420; const pts = new Float32Array(qtd * 3);
    for (let i = 0; i < qtd; i++) { pts[i * 3] = (semente(i + 100) - 0.5) * 30; pts[i * 3 + 1] = (semente(i + 300) - 0.5) * 18; pts[i * 3 + 2] = (semente(i + 500) - 0.5) * 14 - 4; }
    const pgeo = new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const pmat = new THREE.PointsMaterial({ color: 0x6d72e8, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false });
    const poeira = new THREE.Points(pgeo, pmat); cena.add(poeira);

    let estreita = false; let alvo = grade(false);
    const medir = () => {
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      estreita = camera.aspect < 0.9; alvo = grade(estreita);
      // Tela larga: as peças ficam à DIREITA (o texto ocupa a esquerda). Estreita: embaixo do texto.
      conjunto.position.set(estreita ? 0 : 3.4, 0, 0);
      camera.position.set(0, 0, estreita ? 19 : 15);
      camera.updateProjectionMatrix();
    };
    medir();

    const estado = { p: reduzido ? 1 : 0 };
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    const aoMover = (e: PointerEvent) => { mouse.x = e.clientX / window.innerWidth - 0.5; mouse.y = e.clientY / window.innerHeight - 0.5; };

    const origem = new THREE.Vector3();
    const quadro = (t: number) => {
      mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
      conjunto.rotation.y = mouse.sx * 0.5 + (1 - estado.p) * Math.sin(t * 0.15) * 0.2;
      conjunto.rotation.x = mouse.sy * 0.3;
      pecas.forEach((peca, i) => {
        // Cada peça encaixa um pouco depois da anterior (escada), não todas de uma vez.
        const pi = suave(limitar((estado.p - i * 0.045) / (1 - (N - 1) * 0.045)));
        const solta = SOLTAS[i]; const flutua = Math.sin(t * 0.8 + i) * 0.25 * (1 - pi);
        // Celular: soltas, ficam numa faixa achatada rente à borda de baixo (não cobrem os botões).
        origem.copy(solta.pos); if (estreita) origem.y *= 0.3;
        peca.position.lerpVectors(origem, alvo[i], pi); peca.position.y += flutua;
        peca.rotation.set(
          (solta.rot.x + t * solta.giro) * (1 - pi),
          (solta.rot.y + t * solta.giro * 0.8) * (1 - pi),
          solta.rot.z * (1 - pi),
        );
        const escala = 0.82 + 0.18 * pi; peca.scale.setScalar(escala);
      });
      poeira.rotation.y = t * 0.02; poeira.rotation.x = Math.sin(t * 0.05) * 0.05;
      camera.position.y = (1 - estado.p) * 0.4;
      // Celular: as peças sobem da borda de baixo conforme se encaixam.
      if (estreita) conjunto.position.y = -7 * (1 - suave(estado.p));
      camera.lookAt(0, 0, 0);
      renderer.render(cena, camera);
    };

    let raf = 0; const inicio = performance.now();
    // Depois da montagem a cena fica invisível (opacidade 0): para de desenhar e poupa bateria.
    let apagada = false;
    const loop = () => { raf = requestAnimationFrame(loop); if (!document.hidden && !apagada) quadro((performance.now() - inicio) / 1000); };
    let gatilho: ScrollTrigger | null = null; let apagar: ScrollTrigger | null = null;
    if (reduzido) {
      quadro(0);
    } else {
      // Progresso da montagem preso à rolagem: do topo até o fim da seção da montagem.
      gatilho = ScrollTrigger.create({
        trigger: document.querySelector('[data-lp-montagem]') ?? document.body,
        start: 'top bottom', end: 'bottom center', scrub: 0.8,
        onUpdate: (st) => { estado.p = st.progress; },
      });
      apagar = ScrollTrigger.create({ trigger: document.getElementById('ramos') ?? document.body, start: 'top 35%', onEnter: () => { apagada = true; }, onLeaveBack: () => { apagada = false; } });
      window.addEventListener('pointermove', aoMover);
      loop();
    }
    const aoRedimensionar = () => { medir(); if (reduzido) quadro(0); };
    window.addEventListener('resize', aoRedimensionar);

    return () => {
      cancelAnimationFrame(raf); gatilho?.kill(); apagar?.kill();
      window.removeEventListener('pointermove', aoMover); window.removeEventListener('resize', aoRedimensionar);
      geo.dispose(); materiais.forEach((m) => m.dispose()); pgeo.dispose(); pmat.dispose(); ambiente.dispose(); pmrem.dispose(); renderer.dispose();
    };
  }, [reduzido]);

  return <canvas ref={ref} className="lp-cena" aria-hidden="true" data-webgl={ok === null ? 'carregando' : ok ? 'ok' : 'indisponivel'} />;
}
