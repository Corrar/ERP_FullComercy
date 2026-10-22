// src/lib/socket.ts — Socket.IO com o mesmo JWT; uma conexão por sessão, lazy.
import { io, type Socket } from 'socket.io-client';
import { session } from './session';
import { useEffect } from 'react';

// API em outro domínio: conecta na ORIGEM de VITE_API_URL. Sem ela (dev com proxy do Vite,
// nginx do compose, rewrite da Vercel), mesmo host do site.
// O rewrite da Vercel não repassa WebSocket: lá o Socket.IO fica no long-polling (VITE_SOCKET_POLLING=1)
// em vez de tentar o upgrade a cada conexão e sujar o console.
function conectar(auth: Record<string, string>): Socket {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  const origin = api && /^https?:\/\//.test(api) ? new URL(api).origin : undefined;
  const polling = import.meta.env.VITE_SOCKET_POLLING === '1';
  return io(origin, { path: '/socket.io', auth, autoConnect: true, ...(polling ? { transports: ['polling'] } : {}) });
}

let sock: Socket | null = null;
export function socket(): Socket | null {
  const s = session.get(); if (!s) return null;
  if (!sock) {
    sock = conectar({ token: s.accessToken });
    session.subscribe((ns) => { if (!ns) { sock?.disconnect(); sock = null; } });
  }
  return sock;
}
/** Hook: ouve um evento enquanto o componente viver. */
export function useSocketEvent(event: string, handler: (payload: any) => void, topic?: string) {
  useEffect(() => {
    const so = socket(); if (!so) return;
    if (topic) so.emit('subscribe', topic);
    so.on(event, handler);
    return () => { so.off(event, handler); };
  }, [event, topic, handler]);
}

/** Acompanhamento público (sem login): conexão própria com o token do pedido; avisa quando muda. */
export function useAcompanhamento(trackToken: string | undefined, aoMudar: () => void) {
  useEffect(() => {
    if (!trackToken) return;
    const so = conectar({ track: trackToken });
    so.on('track.update', aoMudar);
    return () => { so.off('track.update', aoMudar); so.disconnect(); };
  }, [trackToken, aoMudar]);
}
