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
- **Dois clients, dois papéis de banco.** `prisma` (plataforma, `DATABASE_ADMIN_URL`, `BYPASSRLS`)
  só para login, refresh, onboarding, jobs e snapshot de módulos. `ctx().db` (tenant,
  `DATABASE_URL`, papel comum) para o negócio. Fora de transação, a extensão manda a operação num
  LOTE `[set_config, operação]`; dentro, segue na conexão da transação; e se um service usar o
  client de fora dentro de uma transação, a extensão redireciona para a transação (detectado por
  `__internalParams.transaction`). Assim NENHUMA query de negócio chega ao banco sem o GUC — e o
  RLS pode ser estrito: sem GUC, zero linhas e escrita recusada (provado no e2e, direto no banco).
- **FK composta** `(tenant_id, x_id) → (tenant_id, id)`: o banco recusa um pedido da empresa A
  apontando para um cliente da empresa B. Consequência: não existe `onDelete: SetNull` (anularia o
  `tenant_id`); cadastro se desativa (`isActive=false`), não se apaga.

## 3. Árvore de diretórios

Monorepo (npm workspaces): `apps/api` e `apps/web`. A raiz tem só o `package.json` que delega,
`docker-compose.yml`, CI e docs.

```
ERP_FullComercy/
├── package.json                    # workspaces: apps/* — scripts delegam (dev, build, test, prisma:*)
├── docker-compose.yml              # db (dois papéis) + api + web (nginx com proxy /api)
├── .github/workflows/ci.yml        # unit → build web → migrate → RLS → seed → e2e
├── docs/ARQUITETURA.md · docs/API.md (gerado)
├── CLAUDE.md · README.md
│
├── apps/web/                       # ══ FRONT ══ React 18 + Vite + TS, sem framework de UI
│   ├── index.html · vite.config.ts (proxy /api, /socket.io; alias @) · nginx.conf · Dockerfile
│   ├── playwright.config.ts · e2e/  # navegador real: sobe API (3300) + Vite (5180); core.spec, storefront.spec
│   └── src/
│       ├── main.tsx · styles.css   # tokens e utilitários (trocar o visual = este arquivo)
│       ├── app/
│       │   ├── modules.ts          # REGISTRO DE MÓDULOS do front (espelha o da API) + menus do core
│       │   ├── Shell.tsx           # sidebar gated por módulo ativo + permissão; sino; conta
│       │   └── router.tsx          # rotas do core + rotas de cada módulo (RequireAuth, RequireModule)
│       ├── lib/
│       │   ├── api.ts              # fetch com Bearer, refresh automático em 401, ApiError
│       │   ├── session.ts          # tokens/usuário/tenant/permissões/módulos; can(), hasModule()
│       │   ├── socket.ts           # Socket.IO lazy com o mesmo JWT; useSocketEvent()
│       │   ├── use-api.ts          # useGet / useAction (sem react-query)
│       │   └── format.ts           # R$, datas, rótulos de status em PT
│       ├── components/ui.tsx       # Card, Kpi, Badge, Table, Modal, Form, Tabs, Toast
│       ├── public/Storefront.tsx   # vitrine pública do cardápio + acompanhamento do pedido (sem login)
│       ├── core/                   # auth (login, esqueci, redefinir, conta), dashboard, orders,
│       │                           # customers, products, stock, purchases, finance, users, roles,
│       │                           # integrations, company (módulos/configurações), notifications (sino)
│       │   (detalhes: CustomerDetail, ProductDetail, PurchaseDetail com edição, variantes, mínimo, recebimento parcial, devolução)
│       └── modules/
│           ├── varejo/             # Pdv, Caixa, Grade, Etiquetas, Comissoes, Relatorios
│           ├── food/               # Salao (mesas → comanda → rodada → conta), Kds, Entregas, Cardapio
│           ├── academia/           # Painel, Recepcao (check-in + catraca ao vivo), Matriculas, Planos, Turmas, Acesso
│           └── servicos/           # PainelOS (kanban), NovaOS, OsDetalhe (orçamento/aprovação/checklist), Agenda, Veiculos
│
└── apps/api/                       # ══ API ══
        ├── prisma/
│   ├── schema.prisma               # CORE (seção 1) + MÓDULOS (seções 2–5), tenant_id em tudo
│   ├── seed.ts                     # 5 empresas de demonstração, pelo MESMO onboarding da plataforma
│   └── sql/001_rls_tenant.sql      # Row Level Security + CHECKs de estoque
├── test/                           # node:test, sem banco (resolução de módulo, funções puras, catálogo)
├── src/
│   ├── server.ts                   # listen + Socket.IO + jobs + shutdown
│   ├── app.ts                      # montagem na ordem: público → plataforma → core privado → módulos
│   ├── config/env.ts               # env validado com zod no boot
│   ├── infra/
│   │   ├── prisma.ts               # DOIS clients (plataforma/tenant), extensão RLS-aware, tenantTransaction()
│   │   ├── realtime.ts             # Socket.IO: sala por tenant derivada do JWT; ponte eventos → sala
│   │   └── mailer.ts               # e-mail transacional: SMTP (nodemailer) ou console
│   ├── jobs/                       # scheduler em processo; core.jobs (outbox, expiração de pagamento); módulos declaram os seus
│   ├── shared/                     # errors, http, money, events, crypto, csv (?format=csv), request-log (X-Request-Id), audit-http (opt-in)
│   │
│   ├── core/                       # ══ NÚCLEO UNIVERSAL ══ (nada de nicho aqui)
│   │   ├── tenancy/                # ctx() em AsyncLocalStorage, cache de módulos, runAsTenant() p/ jobs e rotas públicas
│   │   ├── platform/               # /platform: onboarding de empresa, status, módulos (x-platform-key)
│   │   ├── auth/                   # login (tenant+email), refresh com rotação, /auth/me, esqueci/redefinir senha, authenticate
│   │   ├── rbac/                   # catálogo de permissões, effectivePermissions(), requirePermission, perfis
│   │   ├── users/                  # CRUD, convite por e-mail, papéis, exceções individuais, senha
│   │   ├── dashboard/              # GET /dashboard: KPIs do core + dos módulos ativos
│   │   ├── customers/              # CRUD, endereços, resumo comercial
│   │   ├── finance/                # títulos, baixas, contas, categorias, fluxo de caixa — ÚNICA porta de dinheiro
│   │   ├── inventory/              # produtos/variantes/categorias/armazéns, MOTOR de estoque, transferência, razão, mínimo, inventário físico
│   │   ├── audit/                  # leitura do log de auditoria
│   │   ├── integration/            # outbox durável + webhooks por empresa (HMAC, retry/backoff) + despachante
│   │   ├── notifications/          # o sino: avisos por evento, leitura por pessoa
│   │   ├── purchases/              # fornecedores, pedidos de compra (recebimento parcial, custo médio, a pagar, sugestão), devolução ao fornecedor
│   │   ├── payments/               # intenções de pagamento online + providers/ (manual, mock; gateway real = adaptador)
│   │   └── orders/                 # ══ O PEDIDO GENÉRICO ══
│   │       ├── sales-strategy.ts   #   contrato SalesStrategy + registry + resolve() + draftFromOrder()
│   │       ├── core-sales.strategy.ts
│   │       ├── order.service.ts    #   createOrder / addItems / removeItem / addPayments / transition / cancel / dashboard
│   │       ├── order.controller.ts
│   │       └── order.routes.ts     #   POST /orders é a porta única de venda
│   │
│   └── modules/                    # ══ MÓDULOS ══ (cada pasta é autocontida)
│       ├── module.contract.ts      # ModuleDefinition: key, router, publicRouter, permissions, salesStrategy, onEnable, jobs
│       ├── module.registry.ts      # registra permissões + estratégia + jobs; monta /m/<módulo> e /public/<módulo>
│       ├── require-module.middleware.ts
│       ├── index.ts                # A LISTA: varejo, food, academia, servicos
│       │
│       ├── varejo/                 # tabelas ret_*
│       │   ├── index.ts            #   definição (+ onEnable: eixos Tamanho/Cor, etiqueta padrão)
│       │   ├── routes/varejo.routes.ts
│       │   ├── controllers/varejo.controller.ts
│       │   └── services/
│       │       ├── retail-sales.strategy.ts   # PDV: OPEN → consome estoque → COMPLETED ao pagar; vale de troca; comissão
│       │       ├── pdv.service.ts             # abrir/fechar caixa, sangria/suprimento, conferência, resumo
│       │       ├── grade.service.ts           # eixos/valores, matriz tamanho×cor → variantes do core
│       │       ├── etiquetas.service.ts       # modelos, lotes, expansão, render ZPL e PDF (pdfkit + bwip-js)
│       │       ├── comissao.service.ts        # cálculo por item com vigência, regras, aprovação, pagamento
│       │       ├── devolucoes.service.ts      # devolução/troca: reestoque + título a pagar (vale)
│       │       └── relatorios.service.ts      # vendedor, hora, curva ABC, sem giro
│       │
│       ├── food/                   # tabelas food_*
│       │   ├── index.ts            #   (+ publicRouter; onEnable: 10 mesas, grupos de adicionais)
│       │   ├── routes/food.routes.ts
│       │   ├── controllers/food.controller.ts
│       │   └── services/
│       │       ├── food-sales.strategy.ts     # OPEN → tickets por estação; comanda fecha no caixa; rodada = afterItemsAdded
│       │       ├── mesas.service.ts           # mapa do salão, comanda, conta, transferência, fechamento com rateio
│       │       ├── cozinha.service.ts         # KDS: QUEUED → PREPARING → READY → SERVED; projeção no core; tempos
│       │       ├── entregadores.service.ts    # entrega, zonas por CEP, acerto do entregador
│       │       ├── cardapio.service.ts        # menus/categorias/itens/adicionais + ficha técnica (CMV) + cardápio público
│       │       ├── pedido-online.service.ts   # pedido do cliente final sem login (runAsTenantSlug) + acompanhamento
│       │       └── relatorios.service.ts
│       │
│       ├── academia/               # tabelas gym_*
│       │   ├── index.ts            #   (+ publicRouter: webhook da catraca; jobs: cobrança recorrente, sessões de turma)
│       │   ├── routes/academia.routes.ts
│       │   ├── controllers/academia.controller.ts
│       │   └── services/
│       │       ├── gym-sales.strategy.ts      # adesão: taxa + 1º período; matrícula nasce ao PAGAR
│       │       ├── assinaturas.service.ts     # recorrência, inadimplência, pausar/retomar/trocar plano
│       │       ├── acesso.service.ts          # decidirAcesso() única p/ recepção e catraca; credenciais; dispositivos
│       │       ├── turmas.service.ts          # turmas, geração de sessões, reservas, chamada
│       │       └── relatorios.service.ts      # painel (MRR, churn), frequência, pico, sumidos
│       │
│       └── servicos/               # tabelas svc_*
│           ├── index.ts            #   (+ onEnable: catálogo básico)
│           ├── routes/servicos.routes.ts
│           ├── controllers/servicos.controller.ts
│           └── services/
│               ├── os-sales.strategy.ts       # OS: CONFIRMED + RESERVA peças; fecha por ENTREGA; placa nova vira veículo
│               ├── os.service.ts              # máquina de estados, orçamento/aprovação, checklist, anexos, relatórios
│               ├── agenda.service.ts          # agenda com capacidade de boxes; chegada → OS
│               └── veiculos.service.ts        # placa normalizada, lista, histórico
    ├── scripts/                    # prisma-admin.js (CLI como plataforma), apply-rls.js, gerar-api-md.ts
    ├── Dockerfile · prisma.config.ts · .env.example
    └── (docker/initdb/01-roles.sql na raiz: os dois papéis para o compose)
```

### 3.1 Como o front espelha a modularidade

- `/auth/login` e `/auth/me` devolvem `modules` (ativos na empresa) e `permissions` (efetivas, ou
  `['*']` para admin). A sessão guarda os dois; `hasModule()` e `can()` decidem o que aparece.
- `MODULES` em `app/modules.ts` tem, por módulo, `nav` (itens com a permissão exigida) e `routes`.
  O `Shell` só desenha grupos de módulos ativos; o `router` envolve as rotas do módulo em
  `RequireModule`, que explica e aponta para "Empresa e módulos" se a empresa não o tem.
- As telas de venda de cada módulo chamam o MESMO `POST /orders` da API, com `moduleData` próprio:
  o PDV manda `posSessionId`; o salão manda `tabId` e `menuId`; a adesão manda `planId`; a OS manda
  `plate` e `complaint`. Nenhuma tela sabe de estoque ou financeiro — isso é a API.
- Tempo real: `useSocketEvent` liga a tela ao evento (`kitchen.ticket` no KDS, `delivery.status`
  nas entregas, `gym.access` na recepção, `os.status` no painel, `notification` no sino).

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
| `afterItemsAdded` | — | tickets só dos itens novos | — | evento no histórico da OS |
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

- **Gateway de pagamento real**: a abstração e o provedor `mock` existem e estão cobertos por
  teste; PIX dinâmico de banco / cartão é um adaptador em `core/payments/providers/` a escrever
  com as credenciais do cliente.
- **Fiscal** (NFC-e/NF-e/SAT): nada. É integração com emissor externo; o ponto natural é um
  listener de `order.status` COMPLETED gravando no outbox para um provedor fiscal.
- **Barramento em memória entre instâncias**: os eventos são duráveis (outbox) e os webhooks saem de
  qualquer instância, mas o Socket.IO não compartilha salas entre instâncias (precisa do adapter
  Redis se houver mais de uma).
- **E-mail**: provedor SMTP genérico; templates são texto puro (sem HTML/branding por empresa).
- **Segredos cifrados exigem `APP_ENCRYPTION_KEY`** (produção não sobe sem ela). A rotação existe:
  - o selo leva o id da chave;
  - `APP_ENCRYPTION_KEY_PREVIOUS` só abre;
  - o job `core.recifrar-segredos` regrava tudo na chave atual;
  - `GET /platform/segredos` mostra quantos faltam.

  O procedimento está em `docs/OPERACAO.md`.
