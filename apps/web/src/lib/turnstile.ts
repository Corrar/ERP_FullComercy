// src/lib/turnstile.ts — Cloudflare Turnstile no navegador. O widget resolve o desafio (quase
// sempre sem o usuário clicar em nada) e entrega um token de USO ÚNICO, que vai no header
// `X-Turnstile-Token` da chamada protegida. Depois de cada envio o widget é renovado.
// Sem chave de site no catálogo (homologação sem Turnstile), nada é desenhado e nada é exigido.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadScript } from './script';
import { useCatalog } from './billing';

declare global { interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id: string): void; remove(id: string): void } } }

export function useTurnstile(action: string) {
  const { data: catalog } = useCatalog();
  const siteKey = catalog?.security?.turnstileSiteKey ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let alive = true;
    loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit').then(() => {
      if (!alive || !ref.current || !window.turnstile) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: siteKey, action, language: 'pt-br', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', size: 'flexible',
        callback: (t: string) => { setToken(t); setError(null); },
        'expired-callback': () => setToken(null),
        'error-callback': () => { setToken(null); setError('A verificação anti-robô falhou. Recarregue a página.'); },
      });
    }, (e) => setError(e.message));
    return () => { alive = false; if (widget.current) window.turnstile?.remove(widget.current); widget.current = null; };
  }, [siteKey, action]);

  /** Header para a chamada protegida (vazio quando o Turnstile está desligado). */
  const headers = useCallback((): Record<string, string> => (siteKey ? { 'x-turnstile-token': token ?? '' } : {}), [siteKey, token]);
  /** Token é de uso único: renova depois de cada tentativa (deu certo ou não). */
  const reset = useCallback(() => { setToken(null); if (widget.current) window.turnstile?.reset(widget.current); }, []);
  const ready = !siteKey || !!token;
  return { enabled: !!siteKey, ready, headers, reset, error, slot: ref };
}
