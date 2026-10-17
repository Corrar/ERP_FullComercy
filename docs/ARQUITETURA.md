# Arquitetura — FullComercy

> ERP SaaS modular e multi-tenant. Este documento é a referência de **por que** o código está
> organizado como está. O **como** está nos cabeçalhos de cada arquivo.

## 1. Os três problemas e a resposta de cada um

| Problema | Resposta | Onde |
|---|---|---|
| Várias empresas no mesmo banco sem vazar dado | `tenant_id` em toda tabela, FK composta `(tenant_id, id)`, client Prisma que injeta o tenant, RLS no Postgres | `prisma/schema.prisma`, `src/infra/prisma.ts`, `prisma/sql/001_rls_tenant.sql` |
| Nicho não pode poluir o núcleo | Core só com o universal; módulo **estende** por tabela própria (prefixo) e extensão 1:1 de `core_orders` | seções 2–5 do schema, `src/modules/*` |
| Ligar/desligar módulo por empresa sem redeploy | `core_tenant_modules` + registro de módulos em código + `requireModule` + resolução de estratégia de venda | `src/modules/module.registry.ts`, `src/core/orders/sales-strategy.ts` |

## 2. Multi-tenancy: as camadas

```
request ─► authenticate (JWT: sub=userId, tid=tenantId; confere is_active no banco)
        ─► tenantContext (carrega tenant + módulos ativos [cache 15 s]; cria ctx().db)
        ─► requireModule(KEY)        (só em /m/<módulo>)
        ─► requirePermission(chave)  (lê do banco a cada request; admin = bypass)
        ─► controller ─► service ─► ctx().db / tenantTransaction()
```

- **`ctx()`** é `AsyncLocalStorage`: o tenant é ambiente, não argumento. Service nunca recebe
  `tenantId` por parâmetro "para não esquecer" — ele não tem como esquecer.
- **`ctx().db`** é o PrismaClient estendido: injeta `tenantId` em `where` de toda leitura/escrita e
  em `data` de todo `create` (menos no modelo `Tenant`). O tipo gerado ainda pede `tenantId` no
  `create` de topo; o código passa explicitamente e a extensão fica como rede.
- **`tenantTransaction()`** abre transação interativa e roda `SET LOCAL app.tenant_id`. Com o RLS
  ligado, uma query que escapar da extensão por bug vê zero linhas, não linhas alheias.
- **FK composta** `(tenant_id, x_id) → (tenant_id, id)`: o banco recusa um pedido da empresa A
  apontando para um cliente da empresa B. Consequência: não existe `onDelete: SetNull` (anularia o
  `tenant_id`); cadastro se desativa (`isActive=false`), não se apaga.

## 3. Árvore de diretórios

```
ERP_FullComercy/
├── prisma/
│   ├── schema.prisma               # CORE (seção 1) + MÓDULOS (seções 2–5), tenant_id em tudo
│   ├── seed.ts                     # onboarding de empresa: admin, perfil, armazém, caixa, módulos
│   └── sql/001_rls_tenant.sql      # Row Level Security + CHECKs de estoque
├── src/
│   ├── server.ts                   # listen + shutdown
│   ├── app.ts                      # montagem na ordem: público → core privado → módulos
│   ├── config/env.ts               # env validado com zod no boot
│   ├── infra/prisma.ts             # client base, prismaForTenant(), tenantTransaction()
│   ├── shared/                     # errors (AppError), http (asyncHandler/parse/errorHandler), money (Decimal)
│   │
│   ├── core/                       # ══ NÚCLEO UNIVERSAL ══ (nada de nicho aqui)
│   │   ├── tenancy/                # contexto da request, cache de módulos ativos, rotas de ligar/desligar
│   │   │   ├── tenant-context.ts   #   ctx(), runWithContext(), isModuleActive(), moduleConfig()
│   │   │   ├── tenant-modules.service.ts
│   │   │   ├── tenant.middleware.ts
│   │   │   ├── tenant.controller.ts
│   │   │   └── tenant.routes.ts    #   GET/PUT /tenant/modules
│   │   ├── auth/                   # login (tenant+email), refresh com rotação, /auth/me, authenticate
│   │   ├── rbac/                   # catálogo de permissões, effectivePermissions(), requirePermission, perfis
│   │   ├── users/
│   │   ├── customers/
│   │   ├── finance/                # títulos (receber/pagar) e baixas — ÚNICA porta de dinheiro
│   │   ├── inventory/              # produtos (sempre com variante) e o MOTOR de estoque (razão imutável)
│   │   └── orders/                 # ══ O PEDIDO GENÉRICO ══
│   │       ├── sales-strategy.ts   #   contrato SalesStrategy + registry + resolve()
│   │       ├── core-sales.strategy.ts  # venda simples (sem módulo)
│   │       ├── order.service.ts    #   createOrder / addPayments / transition / cancel
│   │       ├── order.controller.ts
│   │       └── order.routes.ts     #   POST /orders é a porta única de venda
│   │
│   └── modules/                    # ══ MÓDULOS ══ (cada pasta é autocontida)
│       ├── module.contract.ts      # ModuleDefinition: key, router, permissions, salesStrategy, onEnable
│       ├── module.registry.ts      # registra permissões + estratégia; monta /m/<módulo> e /public/<módulo>
│       ├── require-module.middleware.ts
│       ├── index.ts                # A LISTA: varejo, food, academia, servicos
│       │
│       ├── varejo/                 # tabelas ret_*
│       │   ├── index.ts            #   definição do módulo (+ onEnable: eixos Tamanho/Cor, etiqueta padrão)
│       │   ├── routes/varejo.routes.ts
│       │   ├── controllers/varejo.controller.ts
│       │   └── services/
│       │       ├── retail-sales.strategy.ts   # PDV: OPEN → consome estoque → COMPLETED ao pagar; comissão
│       │       ├── pdv.service.ts             # abrir/fechar caixa, resumo por meio de pagamento
│       │       ├── grade.service.ts           # matriz tamanho×cor → variantes do core
│       │       ├── etiquetas.service.ts       # lote de etiquetas (estrutura; render é adaptador)
│       │       └── comissao.service.ts        # regra mais específica vence, por item, com vigência
│       │
│       ├── food/                   # tabelas food_*
│       │   ├── index.ts            #   (+ publicRouter: cardápio online)
│       │   ├── routes/food.routes.ts
│       │   ├── controllers/food.controller.ts
│       │   └── services/
│       │       ├── food-sales.strategy.ts     # OPEN → tickets por estação; comanda fecha no caixa
│       │       ├── mesas.service.ts           # comanda, conta, fechamento com taxa de serviço e rateio
│       │       ├── cozinha.service.ts         # KDS: QUEUED → PREPARING → READY → SERVED; projeção no core
│       │       ├── entregadores.service.ts    # entrega: PENDING → ASSIGNED → PICKED_UP → DELIVERED
│       │       └── cardapio.service.ts        # cardápio público por slug
│       │
│       ├── academia/               # tabelas gym_*
│       │   ├── index.ts            #   (+ publicRouter: webhook da catraca)
│       │   ├── routes/academia.routes.ts
│       │   ├── controllers/academia.controller.ts
│       │   └── services/
│       │       ├── gym-sales.strategy.ts      # adesão: taxa + 1ª mensalidade; matrícula nasce ao PAGAR
│       │       ├── assinaturas.service.ts     # recorrência: job gera cobrança → FinanceEntry; inadimplência
│       │       └── acesso.service.ts          # decidirAcesso() única para recepção e catraca; credenciais
│       │
│       └── servicos/               # tabelas svc_*
│           ├── index.ts
│           ├── routes/servicos.routes.ts
│           ├── controllers/servicos.controller.ts
│           └── services/
│               ├── os-sales.strategy.ts       # OS: CONFIRMED + RESERVA peças; fecha por ENTREGA, não por pagamento
│               ├── os.service.ts              # máquina de estados de manutenção + projeção no core
│               └── veiculos.service.ts        # placa normalizada (antiga e Mercosul), histórico
├── docs/ARQUITETURA.md
├── CLAUDE.md
├── README.md
└── .env.example
```

## 4. Como o sistema escolhe o módulo de venda

`POST /orders` é uma rota só. Dentro de `createOrder`, a primeira linha útil é
`salesStrategies.resolve(draft)`, que olha **a empresa logada** (`ctx().modules`,
`ctx().tenantSettings`) e o rascunho:

```
1. draft.moduleKey informado?
     módulo NÃO ativo na empresa → 403 MODULE_INACTIVE
     ativo, com estratégia       → ela
     ativo, sem estratégia       → core (módulo só de cadastro)
2. candidatas = estratégias cujo módulo está ativo na empresa
3. nenhuma  → core (venda simples de balcão)
4. uma      → ela                          ← 90% das empresas
5. várias   → a) channel do rascunho casa com exatamente uma → ela
              b) tenant.settings.defaultSalesModule            → ela
              c) 422 MODULE_AMBIGUOUS { candidates }  (front mostra seletor e reenvia)
```

Medido no boot de fumaça (sem banco):

| empresa | rascunho | resultado |
|---|---|---|
| sem módulo | — | Venda simples (core) |
| VAREJO | — | Varejo · PDV |
| VAREJO + FOOD | `channel: TABLE` | Food & Delivery |
| VAREJO + FOOD | `channel: COUNTER` | 422 MODULE_AMBIGUOUS |
| VAREJO + FOOD, default FOOD | `channel: COUNTER` | Food & Delivery |
| VAREJO + FOOD | `moduleKey: SERVICOS` | 403 MODULE_INACTIVE |

Escolhida a estratégia, o core delega a ela só os pontos de decisão de nicho — sempre na
**mesma transação**:

| gancho | Varejo | Food | Academia | Serviços |
|---|---|---|---|---|
| `initialStatus` | OPEN | OPEN | OPEN | CONFIRMED |
| `stockPolicy` | CONSUME | NONE (config) | CONSUME | RESERVE |
| `completeOnFullPayment` | sim | só fora de comanda | sim | **não** (fecha por entrega) |
| `validate` | caixa aberto, vendedor | mesa/comanda/endereço | plano, aluno sem matrícula | cliente, veículo |
| `price` | — | preço do cardápio + adicionais | taxa de adesão + 1º período | — |
| `afterCreate` | `ret_sales` | `food_orders` + tickets + entrega | — | `svc_service_orders` (+ veículo por placa) |
| `afterStatusChange` | comissão ao COMPLETED | cancela cozinha | matrícula ao COMPLETED | cancela OS |

## 5. O que é do core e o que é do módulo (a linha que não se cruza)

| Core | Módulo |
|---|---|
| `Order`, `OrderItem`, `OrderPayment`, status universal | extensão 1:1 (`ret_sales`, `food_orders`, `svc_service_orders`) e status fino |
| `Product` / `ProductVariant` (SKU) | semântica da grade (`ret_*`), item de cardápio (`food_menu_items`) |
| `StockBalance` + `StockMovement` (razão) | **chama** `stock.service`; nunca escreve saldo |
| `FinanceEntry` + `FinancePayment` | **chama** `finance.service`; vincula por `origin/originId` (`gym_membership_charges`) |
| `Customer` | veículo (`svc_vehicles`), matrícula (`gym_memberships`) |
| `Role` + chaves de permissão | **declara** chaves (`index.ts`); não cria tabela de perfil |

## 6. Como nasce um módulo novo (ex.: Posto de combustível)

1. `enum ModuleKey` ganha `POSTO`; tabelas `posto_*` no schema (seção nova), todas com
   `tenant_id`, `@@unique([tenantId, id])`, FK composta.
2. `src/modules/posto/{index.ts, routes/, controllers/, services/}`.
3. `services/posto-sales.strategy.ts` implementa `SalesStrategy` (bomba, bico, encerrante).
4. `index.ts` declara `permissions` (`posto.bombas:operate`…) e `salesStrategy`.
5. Uma linha em `src/modules/index.ts`.
6. Nada no core muda. Empresa liga em `PUT /tenant/modules/POSTO`.

## 7. Dívidas declaradas (o que este lote NÃO entrega)

- **Migrations Prisma** não foram geradas (`prisma migrate dev` exige banco). O schema valida
  (`prisma validate`) e o client gera; a primeira migration nasce no primeiro banco de ensaio.
- **Rotas de plataforma** (`POST /platform/tenants`): o onboarding vive em `prisma/seed.ts` como
  função `onboardTenant`, pronta para virar service.
- **Job de recorrência** (`gerarCobrancasVencidas`) existe como função; o agendador (cron) não.
- **Render de etiqueta** (PDF/ZPL) e **ficha técnica** (baixa de insumo no Food) são adaptadores
  a plugar; os pontos de extensão estão marcados nos services.
- **Cardápio online** só lê; o pedido público do cliente final (sem login) exige canal de
  pagamento e antifraude — fora deste lote.
- **Testes automatizados**: há o boot de fumaça sem banco (registro + resolução de módulo).
  Smokes com banco seguem o ritual da casa (`ritual-ensaio`) e nascem com o primeiro banco.
