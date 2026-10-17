# FullComercy — Backend

ERP SaaS **modular e multi-tenant** para qualquer comércio: varejo, food & delivery, academias e
serviços/automotivo. Um núcleo universal (auth, usuários, RBAC, clientes, financeiro básico,
estoque central e pedido genérico) e módulos que cada empresa liga ou desliga.

## Stack

- **Node.js 20+ · TypeScript · Express 5 · Socket.IO**
- **PostgreSQL** via **Prisma** (um banco, um schema, isolamento por `tenant_id` + RLS)
- **JWT** (access + refresh com rotação), **Helmet**, **express-rate-limit**, **zod**

## Setup

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL e JWT_SECRET
npx prisma migrate dev        # cria as tabelas
psql "$DATABASE_URL" -f prisma/sql/001_rls_tenant.sql   # liga o RLS (defesa em profundidade)
npm run db:seed               # 5 empresas de demonstração
npm run dev                   # http://localhost:3000
```

> A regra da casa sobre credencial vale aqui: `DATABASE_URL` entra por variável de ambiente, nunca
> por argumento de processo. Ver `CLAUDE.md`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | sobe a API com `ts-node` |
| `npm run build` | `prisma generate` + `tsc` → `dist/` |
| `npm start` | roda o build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes unitários (sem banco): resolução de módulo, placa, ciclo, cardápio, catálogo de permissões |
| `npm run smoke:boot` | monta o app sem banco e falha se houver chave de permissão órfã |
| `npm run prisma:migrate` / `prisma:deploy` | migrations (dev / produção) |
| `npm run db:seed` | onboarding das empresas de demonstração |

## Mapa de rotas

| Prefixo | Autenticação | Conteúdo |
|---|---|---|
| `GET /health` | pública | portão de deploy |
| `/auth/*` | pública (`/me` autenticada) | login por `tenant` + e-mail, refresh, logout |
| `/public/food/*` | pública | cardápio online, pedido do cliente final, acompanhamento |
| `/public/academia/*` | pública (token do aparelho) | webhook da catraca |
| `/platform/*` | `x-platform-key` | criar empresa, suspender, ligar módulo (só existe com `PLATFORM_API_KEY`) |
| `/tenant`, `/users`, `/roles`, `/customers`, `/products`, `/stock`, `/finance`, `/orders`, `/audit` | JWT + tenant | o CORE |
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
