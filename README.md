# FullComercy

ERP SaaS **modular e multi-tenant** para qualquer comércio: varejo, food & delivery, academias e
serviços/automotivo. Um núcleo universal (auth, usuários, RBAC, clientes, financeiro básico,
estoque central e pedido genérico) e módulos que cada empresa liga ou desliga.

Monorepo com dois aplicativos (npm workspaces):

| pasta | o quê | stack |
|---|---|---|
| `apps/api` | a API | Node 20 · TypeScript · Express 5 · Prisma · PostgreSQL (RLS) · Socket.IO |
| `apps/web` | o front | React 18 · Vite · TypeScript · react-router · socket.io-client (sem framework de UI) |

O front espelha a modularidade da API: um registro de módulos (`apps/web/src/app/modules.ts`)
monta o menu e as rotas só do que a empresa tem **ativo** e o usuário **pode**. Cada módulo é
uma pasta em `apps/web/src/modules/<módulo>` com suas telas; o núcleo fica em `apps/web/src/core`.

## Loja de módulos (como o cliente compra)

O app abre em `/comecar`: a pessoa escolhe o tipo de comércio (Varejo, Food & Delivery, Academia,
Serviços), liga só as funções que quer — cada uma com preço mensal, total calculado pela API —,
vê a **prévia** do menu do ERP, vai ao carrinho e, **logada** (e-mail/senha ou Google), finaliza com
**cartão**, **boleto** ou **Pix Automático**. A primeira compra ganha **7 dias grátis**; a cobrança
mensal começa depois. Dentro do ERP, o menu **Assinatura** troca funções, forma de pagamento,
mostra faturas e cancela. Detalhes em `ARCHITECTURE.md` §3.2; preços em
`apps/api/src/core/billing/catalog.ts`.

Em desenvolvimento: `GOOGLE_AUTH_MOCK=1` (Google simulado) e `BILLING_PROVIDER=mock` (cartão
`4242 4242 4242 4242` aprova; final `0002` recusa). Os dois são recusados em produção.

## Rodar tudo

```bash
npm install                    # instala os dois workspaces
cp apps/api/.env.example apps/api/.env   # DATABASE_URL, DATABASE_ADMIN_URL, JWT_SECRET
npm run prisma:deploy && npm run db:rls && npm run db:seed
npm run dev                    # API em :3000
npm run dev:web                # front em :5173 (proxy /api e /socket.io para :3000)
```

Login de demonstração: empresa `posto-demo`, `admin@posto-demo.local`, senha do `SEED_ADMIN_PASSWORD`.

## Stack da API

- **Node.js 20+ · TypeScript · Express 5 · Socket.IO**
- **PostgreSQL** via **Prisma** (um banco, um schema, isolamento por `tenant_id` + RLS)
- **JWT** (access + refresh com rotação), **Helmet**, **express-rate-limit**, **zod**

## Setup da API em detalhe

Dois papéis no Postgres, e a aplicação espera os dois:

| papel | variável | o que faz |
|---|---|---|
| plataforma (`BYPASSRLS`) | `DATABASE_ADMIN_URL` | migrations, login, onboarding, jobs |
| tenant (comum) | `DATABASE_URL` | todo o código de negócio, sujeito ao RLS |

```bash
npm run prisma:deploy         # migrations, como plataforma
npm run db:rls                # liga o RLS e dá os grants ao papel do tenant (idempotente)
npm run db:seed               # 5 empresas de demonstração
npm run dev                   # http://localhost:3000
```

Ou tudo em contêiner (API + front atrás de nginx em :8080):
`docker compose up -d db && docker compose run --rm api sh -c "npm run prisma:deploy && npm run db:rls && npm run db:seed" && docker compose up api web`.

> A regra da casa sobre credencial vale aqui: URLs entram por variável de ambiente, nunca por
> argumento de processo (`scripts/prisma-admin.js` faz isso pelo CLI do Prisma). Ver `CLAUDE.md`.

## Scripts (na raiz; cada um delega ao workspace)

| Comando | O que faz |
|---|---|
| `npm run dev` / `npm run dev:web` | API com `ts-node` / front com Vite |
| `npm run build` | API (`prisma generate` + `tsc`) e front (`vite build`) |
| `npm run typecheck` | `tsc --noEmit` nos dois |
| `npm test` | testes unitários (sem banco): resolução de módulo, placa, ciclo, cardápio, catálogo de permissões |
| `npm run smoke:boot` | monta o app sem banco e falha se houver chave de permissão órfã |
| `npm run test:e2e` | 18 fluxos ponta a ponta da API contra o banco (exige `.env` migrado + seed) |
| `npm run test:ui` | Playwright no navegador real: sobe API + Vite e roda login, cliente, venda no PDV e vitrine pública |
| `npm run prisma:migrate` / `prisma:deploy` | migrations, sempre como papel de plataforma |
| `npm run db:rls` | aplica `prisma/sql/001_rls_tenant.sql` via Prisma (sem psql) |
| `npm run db:seed` | onboarding das empresas de demonstração |
| `npm run docs:api` | regenera `docs/API.md` a partir das rotas montadas |

## Mapa de rotas

| Prefixo | Autenticação | Conteúdo |
|---|---|---|
| `GET /health` | pública | portão de deploy |
| `/auth/*` | pública (`/me` autenticada) | login por `tenant` + e-mail, refresh, logout, esqueci a senha, redefinir |
| `GET /dashboard` | JWT + tenant | KPIs do dia do core + dos módulos ativos |
| `/public/food/*` | pública | cardápio online, pedido do cliente final, acompanhamento |
| `/public/academia/*` | pública (token do aparelho) | webhook da catraca |
| `/platform/*` | `x-platform-key` | criar empresa, suspender, ligar módulo (só existe com `PLATFORM_API_KEY`) |
| `/public/payments/:provider/webhook` | pública (assinatura do provedor) | confirmação de pagamento online |
| `/tenant`, `/users`, `/roles`, `/customers`, `/products`, `/stock`, `/finance`, `/orders`, `/audit` | JWT + tenant | o CORE |
| `/suppliers`, `/purchases`, `/payments`, `/webhooks`, `/notifications` | JWT + tenant | compras com custo médio e devolução ao fornecedor, cobrança online, integrações, sino |
| `/stock/counts` | JWT + tenant | inventário físico: abrir, contar bipando, aplicar ajustes |
| `GET /health/ready` | pública | readiness com ping no banco |

Qualquer listagem aceita `?format=csv` (UTF-8 com BOM, `;`, decimal com vírgula). Toda resposta leva `X-Request-Id`.
E-mail transacional (redefinição de senha, convite de usuário via `POST /users/invite`) sai por SMTP quando `SMTP_HOST` existe; sem ele, provedor `console` loga o link.
| `/m/varejo`, `/m/food`, `/m/academia`, `/m/servicos` | JWT + tenant + **módulo ativo** | o que é exclusivo de cada módulo |
| Socket.IO (mesmo JWT) | sala por tenant | `order.*`, `kitchen.ticket`, `delivery.status`, `gym.access`, `os.status`, `stock.low` |

A **venda de qualquer módulo** entra por `POST /orders`. O módulo é resolvido pela configuração da
empresa logada (ver `docs/ARQUITETURA.md`, seção 4). Dados de nicho vão em `moduleData`:

```jsonc
// PDV de loja de roupa
POST /orders { "items":[{"code":"CAM-M-AZUL","quantity":1}],
               "payments":[{"method":"PIX","amount":89.9}],
               "moduleData":{"posSessionId":"…","salespersonId":"…"} }

// Rodada de uma mesa de restaurante
POST /orders { "channel":"TABLE", "items":[{"variantId":"…","quantity":2,"metadata":{"modifiers":[{"name":"Bacon","price":4}]}}],
               "moduleData":{"tabId":"…","menuId":"…"} }

// Abertura de OS
POST /orders { "customerId":"…", "items":[{"description":"Troca de óleo","kind":"SERVICE","quantity":1,"unitPrice":120},{"code":"OLEO-5W30","quantity":4}],
               "moduleData":{"plate":"ABC1D23","mileageIn":84210,"complaint":"Barulho ao frear"} }

// Adesão a plano de academia
POST /orders { "customerId":"…", "channel":"SUBSCRIPTION", "items":[], "payments":[{"method":"CREDIT","amount":149.9}],
               "moduleData":{"planId":"…"} }
```

Depois de criado: `POST /orders/:id/items` (nova rodada, peça aprovada), `POST /orders/:id/payments`,
`POST /orders/:id/transition`, `POST /orders/:id/cancel`, `GET /orders/dashboard`.

## O que cada módulo entrega

| Módulo | Entregue |
|---|---|
| **Varejo** `/m/varejo` | caixa (abrir, sangria/suprimento, fechar com conferência), grade tamanho×cor gerando variantes, matriz de estoque, etiquetas em **ZPL** e **PDF** com Code128, vendedores, regras de comissão com vigência, aprovação e pagamento de comissões, devolução/troca com vale, relatórios (vendedor, hora, curva ABC, sem giro) |
| **Food** `/m/food` | mapa do salão, comandas (abrir, conta, transferir mesa, fechar com taxa e rateio), KDS por estação com tempos, entregas (atribuir, mover, acerto do entregador), zonas por CEP, cardápio completo (menus, categorias, itens, adicionais), **pedido online público** com acompanhamento, relatórios |
| **Academia** `/m/academia` | planos, adesão pelo pedido, recorrência por job (cobrança → financeiro, inadimplência), pausar/retomar/trocar plano, check-in/out, credenciais, dispositivos com token de webhook, log de acessos, turmas com agenda, reservas e chamada, painel (MRR, churn), relatórios (frequência, pico, sumidos) |
| **Serviços** `/m/servicos` | veículos por placa com histórico, OS com status de manutenção projetado no core, orçamento (itens no pedido) e aprovação com recusa parcial, técnico, checklist de entrada/saída, anexos, agenda com capacidade de boxes e chegada → OS, catálogo, relatórios (técnicos, serviços, retorno de clientes) |

Lista completa, com a permissão de cada rota: **`docs/API.md`** (gerada do código).

## Vitrine do cliente final

`/cardapio/<empresa>/<cardápio>` é a página pública do cardápio online (sem login): carrinho, pedido
como convidado para retirada ou entrega, pagamento na entrega ou PIX online, e acompanhamento em
`/pedido/<empresa>/<número>`. O pedido entra na cozinha da loja pelo mesmo `POST /orders`.

## Integrações

- **Webhooks por empresa** (`/webhooks`): eventos duráveis em `core_outbox_events`, entrega assinada
  com HMAC-SHA256 (`X-FC-Signature`), retry com backoff, reenfileiramento manual.
- **Socket.IO** com o mesmo JWT: sala por empresa, eventos de pedido, cozinha, entrega, acesso, OS, estoque.
- **Pagamento online** (`/payments`): abstração de provedor; `manual` e `mock` na caixa, gateway real
  é um adaptador em `src/core/payments/providers/`.
- **Catraca** (`/public/academia/dispositivos/:id/eventos`): token por aparelho, cifrado no banco.
- **Pedido online pago no ato** (`pagarOnline` em `/public/food/pedidos/:tenant`): devolve QR/link do provedor
  configurado na empresa; o webhook do provedor completa o pedido.

## Empresas de demonstração (seed)

| slug | módulos | login |
|---|---|---|
| `loja-demo` | VAREJO | `admin@loja-demo.local` |
| `burger-demo` | FOOD | `admin@burger-demo.local` |
| `fit-demo` | ACADEMIA | `admin@fit-demo.local` |
| `oficina-demo` | SERVICOS | `admin@oficina-demo.local` |
| `posto-demo` | VAREJO + FOOD (`defaultSalesModule: VAREJO`) | `admin@posto-demo.local` |

Senha: `SEED_ADMIN_PASSWORD` do `.env`.

## Documentação

- `PRD.md` (produto) · `ARCHITECTURE.md` (arquitetura) · `RULES.md` (regras) · `DESIGN.md` (UX/UI e convenções de API) · `TASKS.md` (backlog) · `MEMORY.md` (decisões e lições)

- `docs/ARQUITETURA.md` — decisões, árvore de diretórios, como nasce um módulo novo.
- `prisma/schema.prisma` — o schema comentado (regras no cabeçalho).
- `CLAUDE.md` — regras permanentes da casa.
