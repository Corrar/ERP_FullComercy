// src/lib/google.ts — "Entrar com Google" pelo Google Identity Services. O clique tem de cair no
// botão do Google (iframe dele; é o que devolve o ID token), mas o visual é o nosso: a tela desenha
// a pílula da casa e o botão do Google fica por cima, transparente e esticado do mesmo tamanho.
// Quem confere a assinatura do token é a API (`core/account/google.ts`). Script só com client ID.
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

/** Desenha o botão do Google em `el` e o estica para cobrir `el` inteiro (o Google limita a 400 px). */
export async function renderGoogleButton(el: HTMLElement, clientId: string, onCredential: (credential: string) => void) {
  await loadGis();
  window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential), ux_mode: 'popup' });
  const box = el.getBoundingClientRect();
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(400, Math.round(box.width) || 360), locale: 'pt-BR' });
  const btn = el.firstElementChild as HTMLElement | null;
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  if (r.width && r.height) {
    btn.style.transformOrigin = 'top left';
    btn.style.transform = `scale(${box.width / r.width}, ${box.height / r.height})`;
  }
}

/** Credencial do modo simulado (só dev/teste; a API recusa fora de GOOGLE_AUTH_MOCK=1). */
export const mockGoogleCredential = (email: string, name: string) => {
  const json = JSON.stringify({ sub: email.toLowerCase(), email, name });
  return 'mock.' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
