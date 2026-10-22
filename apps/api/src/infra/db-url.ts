// src/infra/db-url.ts — completa a URL do banco com o timeout de conexão que o Neon pede.
//
// O compute do Neon adormece; o primeiro acesso paga o "acordar" (alguns segundos). O Prisma
// desiste da conexão em 5 s por padrão (`connect_timeout`), e o cold start virava erro de
// "Can't reach database server". Quem cola a URL no painel não precisa lembrar disso: se a URL não
// traz `connect_timeout`, entra 20 s. URL que já traz o parâmetro é respeitada.
// ⚠ Os scripts JS (`scripts/prisma-admin.js`, `scripts/apply-rls.js`) repetem esta regra em JS
//   puro porque rodam sem TypeScript; mudou aqui, mude lá.
export function withConnectTimeout(url: string | undefined, seconds = 20): string | undefined {
  if (!url || !/^postgres(ql)?:\/\//.test(url) || /[?&]connect_timeout=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + `connect_timeout=${seconds}`;
}
