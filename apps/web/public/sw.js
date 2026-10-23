// sw.js — service worker do app instalável. O que ele GUARDA é só a casca do app: os arquivos com
// hash do build (/assets/*), os ícones, o manifesto e a página "sem conexão". NUNCA guarda resposta
// da API (/api, /socket.io): ela traz dado de empresa e de sessão. Navegação vai sempre à rede
// primeiro — o sistema precisa da API para funcionar; sem rede, mostra a página offline.
const VERSAO = 'erp-casca-v1';
const CASCA = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Outro domínio (Stripe, Turnstile, Google, fontes) e API: o navegador resolve, sem cache daqui.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  // Arquivo com hash no nome nunca muda: guarda na primeira vez e serve do cache.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  // Ícones e manifesto: do cache se houver, atualizando por trás.
  if (CASCA.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => {
      const rede = fetch(req).then((res) => { if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); } return res; }).catch(() => hit);
      return hit || rede;
    }));
  }
});
