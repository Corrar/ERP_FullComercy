// src/lib/socket.ts — Socket.IO com o mesmo JWT; uma conexão por sessão, lazy.
import { io, type Socket } from 'socket.io-client';
import { session } from './session';
import { useEffect } from 'react';

let sock: Socket | null = null;
export function socket(): Socket | null {
  const s = session.get(); if (!s) return null;
  if (!sock) {
    sock = io({ path: '/socket.io', auth: { token: s.accessToken }, autoConnect: true });
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
