# FullComercy — Web

Front do ERP (React 18 + Vite + TypeScript). Ver `docs/ARQUITETURA.md` §3.1 na raiz.

```bash
npm run dev -w apps/web        # :5173, proxy /api → :3000 (API_PROXY=http://host:porta para mudar)
npm run build -w apps/web      # dist/ estático (nginx.conf serve e repassa /api e /socket.io)
```

- `src/app/modules.ts` — registro de módulos (menu + rotas por módulo ativo e permissão).
- `src/lib/api.ts` — cliente HTTP com refresh automático.
- `src/core/*` — telas do núcleo; `src/modules/*` — telas de cada módulo.
