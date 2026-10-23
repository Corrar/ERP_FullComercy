// src/lib/pwa.ts — o site como APP instalável. Registra o service worker (só no build de produção:
// em desenvolvimento ele atrapalharia o recarregamento) e guarda o convite de instalação do
// navegador (`beforeinstallprompt`), que pode chegar antes de o React montar. iPhone/iPad não têm
// esse convite: lá a instalação é "Compartilhar → Adicionar à Tela de Início", e a tela explica.
import { useEffect, useState } from 'react';

interface ConviteInstalacao extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let convite: ConviteInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); convite = e as ConviteInstalacao; avisar(); });
  window.addEventListener('appinstalled', () => { convite = null; avisar(); });
}

export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** O que a tela pode oferecer: o convite do navegador (Chrome, Edge, Android), as instruções do
 *  iPhone, ou nada (já instalado, ou navegador sem suporte). */
export function useInstalarApp() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN((n) => n + 1); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  if (typeof window === 'undefined' || instalado()) return { modo: 'nenhum' as const };
  if (convite) {
    const c = convite;
    return { modo: 'convite' as const, instalar: async () => { await c.prompt(); const r = await c.userChoice; if (r.outcome === 'accepted') { convite = null; avisar(); } return r.outcome; } };
  }
  return ehIOS() ? { modo: 'ios' as const } : { modo: 'nenhum' as const };
}
