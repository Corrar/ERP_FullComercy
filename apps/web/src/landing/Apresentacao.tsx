// src/landing/Apresentacao.tsx — a PORTA do site e do app para quem ainda não entrou: apresenta o
// produto antes da vitrine ("Qual é o seu comércio?"). Animações:
//   • three.js — as oito peças dos ramos se encaixam com a rolagem (Cena3D);
//   • GSAP + ScrollTrigger — título entrando por palavra, frase da montagem acendendo com a
//     rolagem e o "Como funciona" fixado enquanto os passos avançam (só em tela larga);
//   • Motion — barra de leitura, cabeçalho que ganha fundo, cartões e contadores ao aparecer.
// Movimento reduzido no sistema: tudo aparece parado, sem rolagem presa. Nome, preço e números vêm
// do catálogo da API (regra 13) — nada de número inventado aqui.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { animate, motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Icon } from '@/components/icons';
import { InstalarApp } from '@/components/InstalarApp';
import { BRAND } from '@/app/brand';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';
import { useCatalog } from '@/lib/billing';
import { cart } from '@/lib/cart';
import { useAccount } from '@/lib/account';
import { brl } from '@/lib/format';
import { aPartirDe } from '@/store/money';
import { MODULE_SLUG } from '@/store/shared';
import type { ModuleKey } from '@/lib/session';
import { Cena3D } from './Cena3D';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

const RECURSOS: { icon: string; t: string; d: string }[] = [
  { icon: 'monitor', t: 'PDV com leitor de código', d: 'Venda no balcão com caixa aberto e fechado, troco e pagamento misto.' },
  { icon: 'utensils', t: 'Cardápio online e cozinha', d: 'Pedido do cliente cai na tela da cozinha na hora, por estação.' },
  { icon: 'calendar', t: 'Agenda sem choque', d: 'Salão, clínica e oficina: o horário ocupado não aceita outro.' },
  { icon: 'clipboard', t: 'Ordens de serviço', d: 'Orçamento, aprovação do cliente e acompanhamento por etapa.' },
  { icon: 'dollar', t: 'Financeiro e DRE', d: 'Contas a pagar e a receber, baixas e o resultado do mês.' },
  { icon: 'qr', t: 'Cobrança por Pix', d: 'Cobre o cliente com QR Code e acompanhe o recebimento.' },
  { icon: 'users', t: 'Equipe com perfis prontos', d: 'Caixa, recepção, técnico: cada um vê só o que precisa.' },
  { icon: 'download', t: 'App no celular', d: 'Instale o sistema como app e abra em tela cheia.' },
];

const PASSOS = [
  { n: '01', t: 'Escolha o seu ramo', d: 'Varejo, restaurante, academia, oficina, salão, pet shop, clínica ou pousada — cada um com as telas do seu dia a dia.' },
  { n: '02', t: 'Ligue só o que vai usar', d: 'Cada função é uma peça com preço próprio. Você liga, desliga e vê o valor do mês na hora.' },
  { n: '03', t: 'Comece no mesmo dia', d: 'Você recebe os dados de acesso por e-mail, a equipe ganha perfis prontos e o painel guia os primeiros passos.' },
];

/** Título quebrado em palavras (o GSAP anima cada uma). */
function Palavras({ texto }: { texto: string }) {
  // O espaço fica FORA do bloco animado: dentro de um inline-block o navegador o descarta.
  return <>{texto.split(' ').map((p, i) => <Fragment key={i}><span className="lp-palavra"><span>{p}</span></span>{' '}</Fragment>)}</>;
}

/** Número que conta até o valor quando aparece na tela. */
function Contador({ valor, prefixo = '', sufixo = '', formatar }: { valor: number; prefixo?: string; sufixo?: string; formatar?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null); const visto = useInView(ref, { once: true, margin: '-15% 0px' });
  const reduzido = useReducedMotion(); const [n, setN] = useState(reduzido ? valor : 0);
  useEffect(() => {
    if (!visto) return;
    if (reduzido) { setN(valor); return; }
    const c = animate(0, valor, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => c.stop();
  }, [visto, valor, reduzido]);
  return <span ref={ref} className="mono">{prefixo}{formatar ? formatar(n) : Math.round(n)}{sufixo}</span>;
}

function Revelar({ children, atraso = 0, className }: { children: ReactNode; atraso?: number; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: 0.7, delay: atraso, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.div>;
}

export function Apresentacao() {
  const nav = useNavigate(); const account = useAccount();
  const { data: catalog } = useCatalog();
  const reduzido = !!useReducedMotion();
  const raiz = useRef<HTMLDivElement>(null);
  const [passo, setPasso] = useState(0);
  const [solido, setSolido] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const leitura = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  useMotionValueEvent(scrollY, 'change', (y) => setSolido(y > 24));

  const montar = (m?: ModuleKey) => { if (m) { cart.chooseModule(m); nav(`/comecar/${MODULE_SLUG[m]}`); } else nav('/comecar'); };
  const minimo = catalog ? Math.min(...catalog.modules.map((m) => aPartirDe(catalog, m.key))) / 100 : null;

  useLayoutEffect(() => {
    const mm = gsap.matchMedia(raiz);
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Entrada do topo: palavras do título sobem uma a uma, depois o texto e os botões.
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.lp-hero .lp-palavra > span', { yPercent: 110, duration: 0.8, stagger: 0.045 })
        .from('.lp-hero [data-entrada]', { y: 24, opacity: 0, duration: 0.6, stagger: 0.08 }, '-=0.5');
      // Frase da montagem acende palavra por palavra conforme rola.
      // Quando o conteúdo começa, a cena 3D se apaga (e para de desenhar: ver Cena3D).
      gsap.to('.lp-cena', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '#ramos', start: 'top bottom', end: 'top 35%', scrub: true } });
      gsap.fromTo('.lp-frase .lp-palavra > span', { opacity: 0.12 }, {
        opacity: 1, stagger: 0.1, ease: 'none',
        scrollTrigger: { trigger: '.lp-montagem', start: 'top 70%', end: 'bottom 70%', scrub: true },
      });
    });
    // "Como funciona" fixado com os passos andando — só em tela larga e sem movimento reduzido.
    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      ScrollTrigger.create({
        trigger: '.lp-passos', start: 'top top', end: '+=180%', pin: true, scrub: true,
        onUpdate: (st) => setPasso(Math.min(PASSOS.length - 1, Math.floor(st.progress * PASSOS.length))),
      });
      gsap.fromTo('.lp-passos-barra > span', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.lp-passos', start: 'top top', end: '+=180%', scrub: true } });
      return () => setPasso(0);
    });
    return () => mm.revert();
  }, []);

  // Os cartões dos ramos mudam de altura quando o catálogo chega: recalcula onde cada gatilho começa.
  useEffect(() => { if (catalog) requestAnimationFrame(() => ScrollTrigger.refresh()); }, [catalog]);

  return <div className="lp" ref={raiz}>
    <div className="lp-fundo" aria-hidden="true" />
    <Cena3D reduzido={reduzido} />
    <motion.div className="lp-leitura" style={{ scaleX: leitura }} aria-hidden="true" />

    <header className={`lp-top ${solido ? 'solido' : ''}`}>
      <Link to="/inicio" className="brand" aria-label={`${BRAND.name} — início`}><span className="brand-mark"><Icon name="grid" size={18} stroke={2.2} /></span>{BRAND.name}</Link>
      <nav className="lp-nav hide-sm" aria-label="Seções"><a href="#ramos">Ramos</a><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a></nav>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <InstalarApp compacto />
        {account ? <Link className="btn" to="/minha-conta">Minha conta</Link> : <Link className="btn ghost" to="/login">Entrar</Link>}
        <button className="btn primary hide-sm" onClick={() => montar()}>Montar meu sistema</button>
      </div>
    </header>

    <main>
      <section className="lp-hero">
        <div className="lp-hero-texto">
          <span className="lp-chip" data-entrada><Icon name="sparkles" size={14} /> ERP modular para o seu comércio</span>
          <h1><Palavras texto="O sistema do seu comércio, montado função por função." /></h1>
          <p data-entrada>{BRAND.tagline} Escolha o seu ramo, ligue só o que vai usar e veja o valor na hora — sem pacote fechado.</p>
          <div className="lp-ctas" data-entrada>
            <button className="btn primary lg" onClick={() => montar()}>Montar meu sistema <Icon name="arrowRight" size={18} /></button>
            <Link className="btn lg" to="/login">Já sou cliente</Link>
          </div>
          <div className="lp-garantias" data-entrada>
            {catalog && catalog.trialDays > 0 && <span><Icon name="gift" size={15} /> {catalog.trialDays} dias grátis na primeira compra</span>}
            <span><Icon name="sliders" size={15} /> Você escolhe cada função</span>
            <span><Icon name="undo" size={15} /> Cancele quando quiser</span>
          </div>
        </div>
        <a href="#montagem" className="lp-rolar" aria-label="Rolar para conhecer"><span /></a>
      </section>

      <section id="montagem" className="lp-montagem" data-lp-montagem>
        <p className="lp-frase"><Palavras texto="Cada função é uma peça. Você escolhe as suas, e o sistema se monta do jeito do seu negócio." /></p>
      </section>

      <section id="ramos" className="lp-secao">
        <Revelar className="lp-cabeca"><span className="lp-kicker">Para o seu ramo</span><h2>Um sistema para cada tipo de comércio</h2><p>Cada ramo já vem com as telas do dia a dia. Toque no seu para montar.</p></Revelar>
        <div className="lp-ramos">
          {(catalog?.modules ?? []).map((m, i) => (
            <motion.button key={m.key} type="button" className="lp-ramo" style={accentStyle(m.key)} data-ramo={m.key} onClick={() => montar(m.key)}
              initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ duration: 0.6, delay: (i % 4) * 0.08, ease: [0.16, 1, 0.3, 1] }} whileHover={reduzido ? undefined : { y: -6 }}>
              <span className="mod-icon"><Icon name={MODULE_LOOK[m.key].icon} size={24} stroke={2} /></span>
              <strong>{m.name}</strong><span className="muted">{m.tagline}</span>
              <span className="lp-ramo-preco">a partir de <b className="mono">{brl(aPartirDe(catalog!, m.key) / 100)}</b>/mês</span>
              <span className="lp-ramo-ir">Montar <Icon name="arrowRight" size={14} /></span>
            </motion.button>
          ))}
          {!catalog && [0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 190, borderRadius: 20 }} />)}
        </div>
      </section>

      <section id="como-funciona" className="lp-passos">
        <div className="lp-passos-in">
          <div className="lp-cabeca"><span className="lp-kicker">Como funciona</span><h2>Do zero ao primeiro atendimento em três passos</h2></div>
          <div className="lp-passos-lista">
            <div className="lp-passos-barra" aria-hidden="true"><span /></div>
            {PASSOS.map((p, i) => <div key={p.n} className={`lp-passo ${passo >= i ? 'ativo' : ''}`} data-passo={i}>
              <span className="lp-passo-n mono">{p.n}</span><div><h3>{p.t}</h3><p>{p.d}</p></div>
            </div>)}
          </div>
        </div>
      </section>

      <section id="recursos" className="lp-secao">
        <Revelar className="lp-cabeca"><span className="lp-kicker">Recursos</span><h2>O que o comércio usa todo dia, num lugar só</h2></Revelar>
        <div className="lp-recursos">
          {RECURSOS.map((r, i) => <Revelar key={r.t} atraso={(i % 4) * 0.07} className="lp-recurso"><span className="lp-recurso-ic"><Icon name={r.icon} size={20} /></span><strong>{r.t}</strong><p>{r.d}</p></Revelar>)}
        </div>
      </section>

      {catalog && <section className="lp-numeros" aria-label="O sistema em números">
        <div><b><Contador valor={catalog.modules.length} /></b><span>ramos de comércio</span></div>
        <div><b><Contador valor={catalog.features.length} /></b><span>funções para ligar</span></div>
        {catalog.trialDays > 0 && <div><b><Contador valor={catalog.trialDays} /></b><span>dias grátis na primeira compra</span></div>}
        {minimo !== null && <div><b><Contador valor={minimo} formatar={(n) => brl(n)} /></b><span>a partir de, por mês</span></div>}
      </section>}

      <section className="lp-final">
        <Revelar className="lp-final-in">
          <h2>Monte o seu sistema agora</h2>
          <p>Escolha o ramo, ligue as funções e comece a usar hoje{catalog && catalog.trialDays > 0 ? ` — os primeiros ${catalog.trialDays} dias são por nossa conta` : ''}.</p>
          <button className="btn primary lg" onClick={() => montar()}>Montar meu sistema <Icon name="arrowRight" size={18} /></button>
        </Revelar>
      </section>
    </main>

    <footer className="lp-rodape">
      <span className="row" style={{ gap: 8 }}><span className="brand-mark" style={{ width: 26, height: 26, borderRadius: 8 }}><Icon name="grid" size={14} stroke={2.2} /></span>{BRAND.name}</span>
      <nav className="row" aria-label="Rodapé"><Link to="/comecar">Montar meu sistema</Link><Link to="/login">Entrar</Link><Link to="/login?modo=funcionario">Acesso da equipe</Link></nav>
    </footer>
  </div>;
}

export default Apresentacao;
