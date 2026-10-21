// src/lib/script.ts — carrega um <script> de terceiro UMA vez (Stripe.js, Turnstile, Google).
// Os três exigem ser servidos do domínio deles (PCI, anti-robô, marca): não dá para empacotar.
const loading = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading.delete(src); reject(new Error('Não foi possível carregar um componente de segurança. Verifique a conexão e recarregue.')); };
      document.head.appendChild(s);
    });
    loading.set(src, p);
  }
  return p;
}
