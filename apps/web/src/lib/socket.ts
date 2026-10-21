// src/lib/socket.ts — Socket.IO com o mesmo JWT; uma conexão por sessão, lazy.
import { io, type Socket } from 'socket.io-client';
import { session } from './session';
import { useEffect } from 'react';

let sock: Socket | null = null;
export function socket(): Socket | null {
  const s = session.get(); if (!s) return null;
  if (!sock) {
    // API em outro domínio (front na Vercel, API no Railway): conecta na ORIGEM de VITE_API_URL.
    // Sem ela (dev com proxy do Vite, nginx do compose), mesmo host do site.
    const api = import.meta.env.VITE_API_URL as string | undefined;
    const origin = api && /^https?:\/\//.test(api) ? new URL(api).origin : undefined;
    sock = io(origin, { path: '/socket.io', auth: { token: s.accessToken }, autoConnect: true });
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
