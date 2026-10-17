# FullComercy — Backend

ERP SaaS **modular e multi-tenant** para qualquer comércio: varejo, food & delivery, academias e
serviços/automotivo. Um núcleo universal (auth, usuários, RBAC, clientes, financeiro básico,
estoque central e pedido genérico) e módulos que cada empresa liga ou desliga.

## Stack

- **Node.js 20+ · TypeScript · Express 5 · Socket.IO**
- **PostgreSQL** via **Prisma** (um banco, um schema, isolamento por `tenant_id` + RLS)
- **JWT** (access + refresh com rotação), **Helmet**, **express-rate-limit**, **zod**

## Setup

Dois papéis no Postgres, e a aplicação espera os dois:

| papel | variável | o que faz |
|---|---|---|
| plataforma (`BYPASSRLS`) | `DATABASE_ADMIN_URL` | migrations, login, onboarding, jobs |
| tenant (comum) | `DATABASE_URL` | todo o código de negócio, sujeito ao RLS |

```bash
npm install
cp .env.example .env          # DATABASE_URL (tenant), DATABASE_ADMIN_URL (plataforma), JWT_SECRET
npm run prisma:deploy         # migrations, como plataforma
npm run db:rls                # liga o RLS e dá os grants ao papel do tenant (idempotente)
npm run db:seed               # 5 empresas de demonstração
npm run dev                   # http://localhost:3000
```

Ou tudo em contêiner: `docker compose up -d db && docker compose run --rm api sh -c "npm run prisma:deploy && npm run db:rls && npm run db:seed" && docker compose up api`.

> A regra da casa sobre credencial vale aqui: URLs entram por variável de ambiente, nunca por
> argumento de processo (`scripts/prisma-admin.js` faz isso pelo CLI do Prisma). Ver `CLAUDE.md`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe a API com `ts-node` |
| `npm run build` | `prisma generate` + `tsc` → `dist/` |
| `npm start` | roda o build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes unitários (sem banco): resolução de módulo, placa, ciclo, cardápio, catálogo de permissões |
| `npm run smoke:boot` | monta o app sem banco e falha se houver chave de permissão órfã |
| `npm run test:e2e` | 11 fluxos ponta a ponta contra o banco (exige `.env` migrado + seed) |
| `npm run prisma:migrate` / `prisma:deploy` | migrations, sempre como papel de plataforma |
| `npm run db:rls` | aplica `prisma/sql/001_rls_tenant.sql` via Prisma (sem psql) |
| `npm run db:seed` | onboarding das empresas de demonstração |
| `npm run docs:api` | regenera `docs/API.md` a partir das rotas montadas |

## Mapa de rotas

| Prefixo | Autenticação | Conteúdo |
|---|---|---|
| `GET /health` | pública | portão de deploy |
| `/auth/*` | pública (`/me` autenticada) | login por `tenant` + e-mail, refresh, logout |
| `/public/food/*` | pública | cardápio online, pedido do cliente final, acompanhamento |
| `/public/academia/*` | pública (token do aparelho) | webhook da catraca |
| `/platform/*` | `x-platform-key` | criar empresa, suspender, ligar módulo (só existe com `PLATFORM_API_KEY`) |
| `/public/payments/:provider/webhook` | pública (assinatura do provedor) | confirmação de pagamento online |
| `/tenant`, `/users`, `/roles`, `/customers`, `/products`, `/stock`, `/finance`, `/orders`, `/audit` | JWT + tenant | o CORE |
| `/suppliers`, `/purchases`, `/payments`, `/webhooks`, `/notifications` | JWT + tenant | compras com custo médio e devolução ao fornecedor, cobrança online, integrações, sino |
| `/stock/counts` | JWT + tenant | inventário físico: abrir, contar bipando, aplicar ajustes |
| `GET /health/ready` | pública | readiness com ping no banco |

Qualquer listagem aceita `?format=csv` (UTF-8 com BOM, `;`, decimal com vírgula). Toda resposta leva `X-Request-Id`.
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
| **Varejo** `/m/varejo` | caixa (abrir, sangria/suprimento, fechar com conferência), grade tamanho×cor gerando variantes, matriz de estoque, etiquetas com render **ZPL**, vendedores, regras de comissão com vigência, aprovação e pagamento de comissões, devolução/troca com vale, relatórios (vendedor, hora, curva ABC, sem giro) |
| **Food** `/m/food` | mapa do salão, comandas (abrir, conta, transferir mesa, fechar com taxa e rateio), KDS por estação com tempos, entregas (atribuir, mover, acerto do entregador), zonas por CEP, cardápio completo (menus, categorias, itens, adicionais), **pedido online público** com acompanhamento, relatórios |
| **Academia** `/m/academia` | planos, adesão pelo pedido, recorrência por job (cobrança → financeiro, inadimplência), pausar/retomar/trocar plano, check-in/out, credenciais, dispositivos com token de webhook, log de acessos, turmas com agenda, reservas e chamada, painel (MRR, churn), relatórios (frequência, pico, sumidos) |
| **Serviços** `/m/servicos` | veículos por placa com histórico, OS com status de manutenção projetado no core, orçamento (itens no pedido) e aprovação com recusa parcial, técnico, checklist de entrada/saída, anexos, agenda com capacidade de boxes e chegada → OS, catálogo, relatórios (técnicos, serviços, retorno de clientes) |

Lista completa, com a permissão de cada rota: **`docs/API.md`** (gerada do código).

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

- `docs/ARQUITETURA.md` — decisões, árvore de diretórios, como nasce um módulo novo.
- `prisma/schema.prisma` — o schema comentado (regras no cabeçalho).
- `CLAUDE.md` — regras permanentes da casa.
