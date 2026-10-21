// src/lib/google.ts — "Entrar com Google" pelo Google Identity Services. O botão oficial é
// desenhado pelo próprio Google (exigência de marca) e devolve um ID token; quem confere a
// assinatura é a API (`core/account/google.ts`). Script carregado só quando há client ID.
declare global { interface Window { google?: any } }

let loading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  return (loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = () => resolve(); s.onerror = () => { loading = null; reject(new Error('Não foi possível carregar o login do Google.')); };
    document.head.appendChild(s);
  }));
}

export async function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (credential: string) => void) {
  await loadGis();
  window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential), ux_mode: 'popup' });
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(400, el.clientWidth || 360), locale: 'pt-BR' });
}

/** Credencial do modo simulado (só dev/teste; a API recusa fora de GOOGLE_AUTH_MOCK=1). */
export const mockGoogleCredential = (email: string, name: string) => {
  const json = JSON.stringify({ sub: email.toLowerCase(), email, name });
  return 'mock.' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
