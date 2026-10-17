# ARCHITECTURE — FullComercy

> Visão de arquitetura. O detalhe operacional (árvore completa, ganchos, como nasce um módulo)
> está em `docs/ARQUITETURA.md`; a lista de rotas, em `docs/API.md` (gerado do código).

## 1. Forma geral

Monorepo com npm workspaces:

```
apps/api   Node 20 · TypeScript · Express 5 · Prisma · PostgreSQL · Socket.IO
apps/web   React 18 · Vite · TypeScript (sem framework de UI)
```

Camadas na API, sempre nesta ordem: `routes` (HTTP + permissão) → `controllers` (validação zod,
tradução) → `services` (regra de negócio, Prisma) → banco. Service não conhece HTTP.

## 2. Multi-tenancy

**Um banco, um schema, isolamento por linha.** Toda tabela (menos `core_tenants`) tem
`tenant_id`; toda FK de negócio é composta `(tenant_id, id)`, então o banco recusa referência
cruzada entre empresas mesmo com bug na aplicação; toda unicidade é por tenant.

Três camadas, redundantes de propósito:

1. **Contexto da request** (`AsyncLocalStorage`): `ctx()` dá tenant, usuário, módulos ativos e
   o client Prisma escopado. Service nunca recebe `tenantId` por parâmetro.
2. **Extensão do Prisma** (`infra/prisma.ts`): injeta `tenantId` em todo `where`/`data`; fora de
   transação, embrulha a operação num lote com `set_config('app.tenant_id')`; dentro de
   `tenantTransaction`, segue na conexão que já tem o GUC; se um service usa o client de fora
   dentro de uma transação, redireciona para a transação.
3. **RLS no Postgres** (`prisma/sql/001_rls_tenant.sql`): política estrita por `tenant_id` lendo
   o GUC. Dois papéis: **plataforma** (`BYPASSRLS`, só login/onboarding/jobs/migrations) e
   **tenant** (comum). Sem GUC, zero linhas e escrita recusada.

## 3. Núcleo × módulos

O núcleo tem só o universal. Um módulo **estende**: tabelas próprias com prefixo (`ret_`,
`food_`, `gym_`, `svc_`), extensão 1:1 de `core_orders` quando precisa falar de pedido, nunca
coluna em tabela `core_*`.

Cada módulo é uma pasta autocontida que se apresenta ao `moduleRegistry` com: chave, router
(montado em `/m/<módulo>` atrás de `requireModule`), router público opcional, permissões (entram
no catálogo), estratégia de venda, `onEnable` (semente) e jobs. Retirar um módulo do produto é
apagar a pasta e uma linha; desligar numa empresa é uma linha em `core_tenant_modules`.

### 3.1 O pedido genérico e a estratégia de venda

`POST /orders` é a porta única de venda. `salesStrategies.resolve()` escolhe o módulo pela
empresa logada: explícito (403 se inativo) → único ativo → canal → módulo padrão da empresa →
422 ambíguo. A estratégia decide, na mesma transação: status inicial, política de estoque
(CONSUME / RESERVE / NONE), se pagamento integral conclui, validação, reprecificação, extensão
1:1, reação a itens adicionados e a mudanças de status.

| | Varejo | Food | Academia | Serviços |
|---|---|---|---|---|
| nasce | OPEN | OPEN | OPEN | CONFIRMED |
| estoque | consome | nada (ficha técnica na cozinha) | consome | reserva, consome na entrega |
| conclui ao pagar | sim | só fora de comanda | sim | não (entrega conclui) |

Estoque (`inventory/stock.service.ts`) e dinheiro (`finance/finance.service.ts`) são do núcleo;
módulo chama, nunca reimplementa.

## 4. Eventos e integrações

Barramento tipado em memória (`shared/events.ts`) → três consumidores: Socket.IO (sala por
empresa derivada do JWT), notificações in-app, e **outbox durável** (`core_outbox_events`) que o
job despacha aos webhooks da empresa com HMAC-SHA256 e backoff. Pagamento online é uma abstração
de provedor (`core/payments/providers/`), com `manual` e `mock` na caixa; o gateway real é um
adaptador.

## 5. Front

Espelha a modularidade: `app/modules.ts` registra, por módulo, menu (com permissão exigida) e
rotas; o `Shell` só desenha módulos ativos e itens permitidos (`/auth/me` dá `modules` e
`permissions`); `RequireModule` explica quando a empresa não tem o módulo. `lib/api.ts` é o único
cliente HTTP (Bearer, refresh em 401, `ApiError`); `lib/socket.ts` o único socket. Telas de venda
chamam o mesmo `POST /orders` com `moduleData`. Vitrine pública (`/cardapio/:tenant/:menu`) e
acompanhamento ficam fora do shell autenticado.

## 6. Operação

`docker compose` sobe banco (dois papéis), API e web (nginx servindo o SPA e repassando `/api` e
`/socket.io`). CI: validate → typecheck → unit → build web → migrate → RLS → seed → e2e API →
Playwright. Prisma CLI roda sempre como plataforma (`scripts/prisma-admin.js`); o RLS é aplicado
por `scripts/apply-rls.js` (idempotente, após cada migration).

## 7. Decisões registradas (ADR curto)

| # | Decisão | Por quê | Alternativa rejeitada |
|---|---|---|---|
| 1 | Banco único com RLS, não banco por tenant | custo operacional e migrations N×; RLS dá isolamento forte | schema por tenant (migrations multiplicadas) |
| 2 | FK composta `(tenant_id, id)` em toda relação | o banco barra referência cruzada | FK simples + confiança na aplicação |
| 3 | Sem `onDelete: SetNull` | com FK composta anularia `tenant_id` | — (soft delete por `isActive`) |
| 4 | Variante sempre existe (produto sem grade tem 1 variante padrão) | grão único de estoque/pedido, sem índice parcial | `variant_id` nulo |
| 5 | Dois clients Prisma / dois papéis de banco | login e jobs precisam ver todas as empresas; o negócio não | um papel com bypass (RLS inútil) |
| 6 | Catálogo de permissões em código, texto no banco | sem semear N linhas por tenant; boot falha em chave órfã | tabela de permissões |
| 7 | Estratégia de venda por módulo, pedido único no núcleo | financeiro/estoque unificados; módulo novo sem tocar o núcleo | tabela de venda por módulo |
| 8 | Outbox + barramento em memória | durabilidade sem fila externa; webhooks saem de qualquer instância | fila externa desde o dia 1 |
| 9 | Front sem framework de UI | zero dependência pesada; tokens em um CSS | biblioteca de componentes |
| 10 | Monorepo com workspaces | um `npm install`, CI único, contratos próximos | dois repositórios |
