# API — FullComercy

> Gerado por `npm run docs:api` em 2026-10-22. 331 rotas.

Autenticação: rotas **Core** e de **Módulo** exigem `Authorization: Bearer <access token>`; as de módulo exigem ainda o módulo ATIVO na empresa (403 `MODULE_INACTIVE`). A coluna *permissão* é a chave que `requirePermission` cobra (perfil `admin` passa em todas). Vazio = qualquer usuário logado. Com assinatura da loja, a chave também precisa estar no PLANO da empresa (403 `NOT_IN_PLAN`).

Loja de módulos: `/public/billing/*` é público; `/account/me`, `/account/companies/:id/session` e `/account/checkout` exigem o token da CONTA do comprador (o de `/account/login|register|google`), que não abre rota de empresa — e vice-versa. `/billing/*` segue aberto para empresa suspensa.

## Público

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/health` |  |
| `GET` | `/health/ready` |  |
| `POST` | `/auth/login` |  |
| `POST` | `/auth/refresh` |  |
| `POST` | `/auth/logout` |  |
| `POST` | `/auth/forgot` |  |
| `POST` | `/auth/reset` |  |
| `GET` | `/auth/me` |  |
| `POST` | `/public/payments/:provider/webhook` |  |
| `GET` | `/public/billing/catalog` |  |
| `POST` | `/public/billing/quote` |  |
| `POST` | `/public/billing/webhooks/:provider` |  |
| `POST` | `/account/register` |  |
| `POST` | `/account/login` |  |
| `POST` | `/account/google` |  |
| `POST` | `/account/forgot` |  |
| `POST` | `/account/reset` |  |
| `GET` | `/account/me` |  |
| `POST` | `/account/companies/:tenantId/session` |  |
| `POST` | `/account/companies/:tenantId/reenviar-acesso` |  |
| `GET` | `/account/companies/:tenantId/assinatura` |  |
| `POST` | `/account/billing/card-setup` |  |
| `POST` | `/account/checkout` |  |
| `GET` | `/public/food/cardapio/:tenant/:menu` |  |
| `POST` | `/public/food/pedidos/:tenant` |  |
| `GET` | `/public/food/pedidos/:tenant/:numero` |  |
| `POST` | `/public/academia/dispositivos/:deviceId/eventos` |  |

## Plataforma (x-platform-key)

| Método | Rota | Permissão |
|---|---|---|
| `POST` | `/platform/tenants` |  |
| `GET` | `/platform/tenants` |  |
| `PATCH` | `/platform/tenants/:id/status` |  |
| `PUT` | `/platform/tenants/:id/modules/:key` |  |
| `GET` | `/platform/modules` |  |

## Core · audit

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/audit/` | `core.tenant:manage` |

## Core · billing

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/billing/subscription` | `core.billing:manage` |
| `PUT` | `/billing/subscription/features` | `core.billing:manage` |
| `POST` | `/billing/card-setup` | `core.billing:manage` |
| `PUT` | `/billing/payment-method` | `core.billing:manage` |
| `POST` | `/billing/invoices/:id/pay` | `core.billing:manage` |
| `POST` | `/billing/subscription/cancel` | `core.billing:manage` |
| `POST` | `/billing/subscription/reactivate` | `core.billing:manage` |

## Core · customers

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/customers/` | `core.customers:view` |
| `GET` | `/customers/:id` | `core.customers:view` |
| `GET` | `/customers/:id/summary` | `core.customers:view` |
| `POST` | `/customers/` | `core.customers:manage` |
| `PUT` | `/customers/:id` | `core.customers:manage` |
| `PATCH` | `/customers/:id/active` | `core.customers:manage` |
| `POST` | `/customers/:id/addresses` | `core.customers:manage` |
| `DELETE` | `/customers/:id/addresses/:addressId` | `core.customers:manage` |

## Core · dashboard

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/dashboard/` |  |

## Core · finance

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/finance/summary` | `core.finance:view` |
| `GET` | `/finance/dre` | `core.finance:view` |
| `GET` | `/finance/entries` | `core.finance:view` |
| `POST` | `/finance/entries` | `core.finance:manage` |
| `PATCH` | `/finance/entries/:id` | `core.finance:manage` |
| `POST` | `/finance/entries/:id/settle` | `core.finance:manage` |
| `POST` | `/finance/entries/:id/cancel` | `core.finance:manage` |
| `GET` | `/finance/accounts` | `core.finance:view` |
| `POST` | `/finance/accounts` | `core.finance:manage` |
| `GET` | `/finance/categories` | `core.finance:view` |
| `POST` | `/finance/categories` | `core.finance:manage` |

## Core · notifications

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/notifications/` |  |
| `GET` | `/notifications/unread-count` |  |
| `POST` | `/notifications/read` |  |

## Core · orders

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/orders/` | `core.orders:view` |
| `GET` | `/orders/dashboard` | `core.orders:view` |
| `GET` | `/orders/:id` | `core.orders:view` |
| `POST` | `/orders/` | `core.orders:create` |
| `POST` | `/orders/:id/items` | `core.orders:create` |
| `DELETE` | `/orders/:id/items/:itemId` | `core.orders:create` |
| `POST` | `/orders/:id/payments` | `core.orders:create` |
| `POST` | `/orders/:id/transition` | `core.orders:create` |
| `POST` | `/orders/:id/cancel` | `core.orders:cancel` |

## Core · payments

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/payments/providers` | `core.payments:manage` |
| `GET` | `/payments/intents` | `core.payments:manage` |
| `POST` | `/payments/intents` | `core.payments:manage` |
| `POST` | `/payments/intents/:id/confirm` | `core.payments:manage` |
| `POST` | `/payments/intents/:id/cancel` | `core.payments:manage` |

## Core · products

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/products/` | `core.products:view` |
| `POST` | `/products/` | `core.products:manage` |
| `GET` | `/products/categories` | `core.products:view` |
| `POST` | `/products/categories` | `core.products:manage` |
| `PATCH` | `/products/categories/:id` | `core.products:manage` |
| `GET` | `/products/:id` | `core.products:view` |
| `PATCH` | `/products/:id` | `core.products:manage` |
| `POST` | `/products/:id/variants` | `core.products:manage` |
| `PATCH` | `/products/:id/variants/:variantId` | `core.products:manage` |
| `PUT` | `/products/:id/variants/:variantId/min-level` | `core.stock:move` |

## Core · purchases

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/purchases/` | `core.purchases:view` |
| `GET` | `/purchases/sugestao` | `core.purchases:view` |
| `GET` | `/purchases/:id` | `core.purchases:view` |
| `POST` | `/purchases/` | `core.purchases:manage` |
| `PUT` | `/purchases/:id/items` | `core.purchases:manage` |
| `POST` | `/purchases/:id/ordered` | `core.purchases:manage` |
| `POST` | `/purchases/:id/receive` | `core.purchases:manage` |
| `POST` | `/purchases/:id/returns` | `core.purchases:manage` |
| `POST` | `/purchases/:id/cancel` | `core.purchases:manage` |

## Core · roles

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/roles/` | `core.roles:manage` |
| `POST` | `/roles/` | `core.roles:manage` |
| `PUT` | `/roles/:id/permissions` | `core.roles:manage` |

## Core · stock

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/stock/balances` | `core.stock:view` |
| `GET` | `/stock/low` | `core.stock:view` |
| `GET` | `/stock/ledger` | `core.stock:view` |
| `POST` | `/stock/movements` | `core.stock:move` |
| `POST` | `/stock/transfers` | `core.stock:move` |
| `GET` | `/stock/warehouses` | `core.stock:view` |
| `POST` | `/stock/warehouses` | `core.stock:move` |
| `PATCH` | `/stock/warehouses/:id` | `core.stock:move` |
| `GET` | `/stock/counts` | `core.stock:view` |
| `POST` | `/stock/counts` | `core.stock:move` |
| `GET` | `/stock/counts/:id` | `core.stock:view` |
| `POST` | `/stock/counts/:id/items` | `core.stock:move` |
| `POST` | `/stock/counts/:id/apply` | `core.stock:move` |
| `POST` | `/stock/counts/:id/cancel` | `core.stock:move` |

## Core · suppliers

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/suppliers/` | `core.purchases:view` |
| `POST` | `/suppliers/` | `core.suppliers:manage` |
| `PATCH` | `/suppliers/:id` | `core.suppliers:manage` |

## Core · tenant

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/tenant/modules` | `core.tenant:manage` |
| `PUT` | `/tenant/modules/:key` | `core.tenant:manage` |
| `GET` | `/tenant/settings` | `core.tenant:manage` |
| `PUT` | `/tenant/settings` | `core.tenant:manage` |
| `GET` | `/tenant/primeiros-passos` | `core.tenant:manage` |
| `POST` | `/tenant/primeiros-passos/dispensar` | `core.tenant:manage` |

## Core · users

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/users/` | `core.users:view` |
| `POST` | `/users/` | `core.users:manage` |
| `POST` | `/users/invite` | `core.users:manage` |
| `POST` | `/users/me/password` |  |
| `PATCH` | `/users/:id` | `core.users:manage` |
| `PUT` | `/users/:id/roles` | `core.users:manage` |
| `PUT` | `/users/:id/exceptions` | `core.roles:manage` |
| `PATCH` | `/users/:id/active` | `core.users:manage` |
| `POST` | `/users/:id/reset-password` | `core.users:manage` |

## Core · webhooks

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/webhooks/` | `core.webhooks:manage` |
| `POST` | `/webhooks/` | `core.webhooks:manage` |
| `PATCH` | `/webhooks/:id` | `core.webhooks:manage` |
| `GET` | `/webhooks/:id/deliveries` | `core.webhooks:manage` |
| `GET` | `/webhooks/events/list` | `core.webhooks:manage` |
| `POST` | `/webhooks/events/:id/retry` | `core.webhooks:manage` |
| `POST` | `/webhooks/events/dispatch` | `core.webhooks:manage` |

## Módulo ACADEMIA

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/academia/painel` | `gym.matriculas:view` |
| `GET` | `/m/academia/planos` | `gym.planos:view` |
| `POST` | `/m/academia/planos` | `gym.planos:manage` |
| `PATCH` | `/m/academia/planos/:id` | `gym.planos:manage` |
| `GET` | `/m/academia/matriculas` | `gym.matriculas:view` |
| `GET` | `/m/academia/matriculas/inadimplentes` | `gym.matriculas:view` |
| `GET` | `/m/academia/matriculas/a-vencer` | `gym.matriculas:view` |
| `POST` | `/m/academia/matriculas/rodar-cobranca` | `gym.matriculas:manage` |
| `GET` | `/m/academia/matriculas/:id/cobrancas` | `gym.matriculas:view` |
| `POST` | `/m/academia/matriculas/:id/cancelar` | `gym.matriculas:manage` |
| `POST` | `/m/academia/matriculas/:id/pausar` | `gym.matriculas:manage` |
| `POST` | `/m/academia/matriculas/:id/retomar` | `gym.matriculas:manage` |
| `POST` | `/m/academia/matriculas/:id/trocar-plano` | `gym.matriculas:manage` |
| `GET` | `/m/academia/presentes` | `gym.acesso:operate` |
| `POST` | `/m/academia/checkins` | `gym.acesso:operate` |
| `POST` | `/m/academia/checkins/:id/checkout` | `gym.acesso:operate` |
| `GET` | `/m/academia/frequencia/:customerId` | `gym.matriculas:view` |
| `GET` | `/m/academia/credenciais/:customerId` | `gym.acesso:manage` |
| `POST` | `/m/academia/credenciais` | `gym.acesso:manage` |
| `DELETE` | `/m/academia/credenciais/:id` | `gym.acesso:manage` |
| `GET` | `/m/academia/dispositivos` | `gym.acesso:manage` |
| `POST` | `/m/academia/dispositivos` | `gym.acesso:manage` |
| `PATCH` | `/m/academia/dispositivos/:id` | `gym.acesso:manage` |
| `POST` | `/m/academia/dispositivos/:id/girar-token` | `gym.acesso:manage` |
| `GET` | `/m/academia/acessos` | `gym.acesso:manage` |
| `GET` | `/m/academia/turmas` | `gym.turmas:view` |
| `POST` | `/m/academia/turmas` | `gym.turmas:manage` |
| `PATCH` | `/m/academia/turmas/:id` | `gym.turmas:manage` |
| `POST` | `/m/academia/turmas/gerar-sessoes` | `gym.turmas:manage` |
| `GET` | `/m/academia/agenda` | `gym.turmas:view` |
| `POST` | `/m/academia/agenda/:id/reservas` | `gym.turmas:view` |
| `DELETE` | `/m/academia/agenda/:id/reservas/:customerId` | `gym.turmas:view` |
| `POST` | `/m/academia/agenda/:id/chamada` | `gym.turmas:manage` |
| `GET` | `/m/academia/relatorios/frequencia` | `gym.matriculas:view` |
| `GET` | `/m/academia/relatorios/pico` | `gym.matriculas:view` |
| `GET` | `/m/academia/relatorios/sumidos` | `gym.matriculas:view` |

## Módulo BELEZA

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/beleza/profissionais` | `bel.agenda:operate` |
| `POST` | `/m/beleza/profissionais` | `bel.cadastro:manage` |
| `PATCH` | `/m/beleza/profissionais/:id` | `bel.cadastro:manage` |
| `GET` | `/m/beleza/servicos` | `bel.agenda:operate` |
| `POST` | `/m/beleza/servicos` | `bel.cadastro:manage` |
| `PATCH` | `/m/beleza/servicos/:id` | `bel.cadastro:manage` |
| `GET` | `/m/beleza/agenda` | `bel.agenda:operate` |
| `POST` | `/m/beleza/agenda` | `bel.agenda:operate` |
| `PATCH` | `/m/beleza/agenda/:id` | `bel.agenda:operate` |
| `GET` | `/m/beleza/pacotes` | `bel.agenda:operate` |
| `POST` | `/m/beleza/pacotes` | `bel.pacotes:manage` |
| `PATCH` | `/m/beleza/pacotes/:id` | `bel.pacotes:manage` |
| `GET` | `/m/beleza/pacotes/cliente/:customerId` | `bel.agenda:operate` |
| `GET` | `/m/beleza/comissoes` | `bel.comissoes:view` |
| `POST` | `/m/beleza/comissoes/pagar` | `bel.comissoes:manage` |
| `GET` | `/m/beleza/relatorios/profissionais` | `bel.relatorios:view` |
| `GET` | `/m/beleza/relatorios/servicos` | `bel.relatorios:view` |
| `GET` | `/m/beleza/relatorios/faltas` | `bel.relatorios:view` |

## Módulo CLINICA

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/clinica/profissionais` | `cli.agenda:operate` |
| `POST` | `/m/clinica/profissionais` | `cli.cadastro:manage` |
| `PATCH` | `/m/clinica/profissionais/:id` | `cli.cadastro:manage` |
| `GET` | `/m/clinica/convenios` | `cli.agenda:operate` |
| `POST` | `/m/clinica/convenios` | `cli.convenios:manage` |
| `PATCH` | `/m/clinica/convenios/:id` | `cli.convenios:manage` |
| `GET` | `/m/clinica/convenios-a-receber` | `cli.convenios:manage` |
| `GET` | `/m/clinica/pacientes/:customerId` | `cli.agenda:operate` |
| `PUT` | `/m/clinica/pacientes/:customerId/ficha` | `cli.agenda:operate` |
| `POST` | `/m/clinica/pacientes/:customerId/prontuario` | `cli.prontuario:manage` |
| `GET` | `/m/clinica/agenda` | `cli.agenda:operate` |
| `POST` | `/m/clinica/agenda` | `cli.agenda:operate` |
| `PATCH` | `/m/clinica/agenda/:id` | `cli.agenda:operate` |
| `GET` | `/m/clinica/recibos/:orderId` | `cli.agenda:operate` |
| `GET` | `/m/clinica/relatorios/profissionais` | `cli.relatorios:view` |
| `GET` | `/m/clinica/relatorios/convenios` | `cli.relatorios:view` |
| `GET` | `/m/clinica/relatorios/faltas` | `cli.relatorios:view` |

## Módulo FOOD

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/food/mesas` | `food.salao:operate` |
| `POST` | `/m/food/mesas` | `food.salao:manage` |
| `PATCH` | `/m/food/mesas/:id` | `food.salao:manage` |
| `GET` | `/m/food/comandas` | `food.salao:operate` |
| `POST` | `/m/food/comandas` | `food.salao:operate` |
| `GET` | `/m/food/comandas/:id/conta` | `food.salao:operate` |
| `POST` | `/m/food/comandas/:id/fechar` | `food.salao:close` |
| `POST` | `/m/food/comandas/:id/transferir` | `food.salao:operate` |
| `POST` | `/m/food/comandas/:id/cancelar` | `food.salao:close` |
| `GET` | `/m/food/cozinha/fila` | `food.cozinha:view` |
| `GET` | `/m/food/cozinha/estacoes` | `food.cozinha:view` |
| `POST` | `/m/food/cozinha/tickets/:id/mover` | `food.cozinha:update` |
| `GET` | `/m/food/entregas` | `food.delivery:operate` |
| `POST` | `/m/food/entregas/:id/atribuir` | `food.delivery:operate` |
| `POST` | `/m/food/entregas/:id/mover` | `food.delivery:operate` |
| `GET` | `/m/food/entregadores` | `food.delivery:operate` |
| `POST` | `/m/food/entregadores` | `food.delivery:manage` |
| `PATCH` | `/m/food/entregadores/:id` | `food.delivery:manage` |
| `GET` | `/m/food/entregadores/:id/acerto` | `food.delivery:manage` |
| `GET` | `/m/food/zonas` | `food.delivery:operate` |
| `GET` | `/m/food/zonas/cep/:cep` | `food.delivery:operate` |
| `POST` | `/m/food/zonas` | `food.delivery:manage` |
| `PATCH` | `/m/food/zonas/:id` | `food.delivery:manage` |
| `GET` | `/m/food/menus` | `food.cardapio:manage` |
| `POST` | `/m/food/menus` | `food.cardapio:manage` |
| `GET` | `/m/food/menus/:id` | `food.cardapio:manage` |
| `PATCH` | `/m/food/menus/:id` | `food.cardapio:manage` |
| `POST` | `/m/food/menus/:id/categorias` | `food.cardapio:manage` |
| `POST` | `/m/food/menus/:id/itens` | `food.cardapio:manage` |
| `PATCH` | `/m/food/menus/:id/itens/:itemId` | `food.cardapio:manage` |
| `POST` | `/m/food/menus/:id/itens/:itemId/adicionais` | `food.cardapio:manage` |
| `GET` | `/m/food/menus/:id/itens/:itemId/ficha` | `food.cardapio:manage` |
| `PUT` | `/m/food/menus/:id/itens/:itemId/ficha` | `food.cardapio:manage` |
| `GET` | `/m/food/adicionais` | `food.cardapio:manage` |
| `POST` | `/m/food/adicionais` | `food.cardapio:manage` |
| `GET` | `/m/food/relatorios/itens` | `food.relatorios:view` |
| `GET` | `/m/food/relatorios/tipos` | `food.relatorios:view` |
| `GET` | `/m/food/relatorios/horas` | `food.relatorios:view` |
| `GET` | `/m/food/relatorios/entregadores` | `food.relatorios:view` |

## Módulo HOTEL

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/hotel/painel` | `hot.reservas:operate` |
| `GET` | `/m/hotel/quartos` | `hot.reservas:operate` |
| `POST` | `/m/hotel/quartos` | `hot.quartos:manage` |
| `PATCH` | `/m/hotel/quartos/:id` | `hot.quartos:manage` |
| `POST` | `/m/hotel/quartos/:id/status` | `hot.governanca:operate` |
| `GET` | `/m/hotel/disponiveis` | `hot.reservas:operate` |
| `GET` | `/m/hotel/reservas` | `hot.reservas:operate` |
| `POST` | `/m/hotel/reservas` | `hot.reservas:operate` |
| `PATCH` | `/m/hotel/reservas/:id` | `hot.reservas:operate` |
| `POST` | `/m/hotel/reservas/:id/checkout` | `hot.reservas:operate` |
| `GET` | `/m/hotel/relatorios/ocupacao` | `hot.relatorios:view` |

## Módulo PET

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/pet/pets` | `pet.pets:view` |
| `GET` | `/m/pet/pets/:id` | `pet.pets:view` |
| `POST` | `/m/pet/pets` | `pet.pets:manage` |
| `PATCH` | `/m/pet/pets/:id` | `pet.pets:manage` |
| `GET` | `/m/pet/banho-tosa` | `pet.banho:operate` |
| `POST` | `/m/pet/banho-tosa` | `pet.banho:operate` |
| `POST` | `/m/pet/banho-tosa/:id/mover` | `pet.banho:operate` |
| `POST` | `/m/pet/pets/:id/vacinas` | `pet.vet:manage` |
| `POST` | `/m/pet/pets/:id/atendimentos` | `pet.vet:manage` |
| `GET` | `/m/pet/lembretes` | `pet.vet:view` |
| `GET` | `/m/pet/relatorios/resumo` | `pet.relatorios:view` |

## Módulo SERVICOS

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/servicos/veiculos` | `svc.os:view` |
| `GET` | `/m/servicos/veiculos/placa/:plate` | `svc.os:view` |
| `GET` | `/m/servicos/veiculos/:id/historico` | `svc.os:view` |
| `POST` | `/m/servicos/veiculos` | `svc.veiculos:manage` |
| `PATCH` | `/m/servicos/veiculos/:id` | `svc.veiculos:manage` |
| `GET` | `/m/servicos/os/painel` | `svc.os:view` |
| `GET` | `/m/servicos/os/por-pedido/:orderId` | `svc.os:view` |
| `GET` | `/m/servicos/os/:id` | `svc.os:view` |
| `PATCH` | `/m/servicos/os/:id` | `svc.os:update` |
| `POST` | `/m/servicos/os/:id/mover` | `svc.os:update` |
| `POST` | `/m/servicos/os/:id/orcamento` | `svc.os:update` |
| `POST` | `/m/servicos/os/:id/aprovar` | `svc.os:update` |
| `PUT` | `/m/servicos/os/:id/tecnico` | `svc.os:update` |
| `POST` | `/m/servicos/os/:id/checklist` | `svc.os:update` |
| `PATCH` | `/m/servicos/os/:id/checklist/:itemId` | `svc.os:update` |
| `POST` | `/m/servicos/os/:id/anexos` | `svc.os:update` |
| `GET` | `/m/servicos/catalogo` | `svc.os:view` |
| `POST` | `/m/servicos/catalogo` | `svc.catalogo:manage` |
| `PATCH` | `/m/servicos/catalogo/:id` | `svc.catalogo:manage` |
| `GET` | `/m/servicos/agenda` | `svc.agenda:operate` |
| `POST` | `/m/servicos/agenda` | `svc.agenda:operate` |
| `PATCH` | `/m/servicos/agenda/:id` | `svc.agenda:operate` |
| `POST` | `/m/servicos/agenda/:id/chegada` | `svc.os:update` |
| `GET` | `/m/servicos/relatorios/status` | `svc.os:view` |
| `GET` | `/m/servicos/relatorios/tecnicos` | `svc.relatorios:view` |
| `GET` | `/m/servicos/relatorios/servicos` | `svc.relatorios:view` |
| `GET` | `/m/servicos/relatorios/retorno` | `svc.relatorios:view` |

## Módulo VAREJO

| Método | Rota | Permissão |
|---|---|---|
| `GET` | `/m/varejo/caixa` | `varejo.pdv:operate` |
| `GET` | `/m/varejo/caixa/atual` | `varejo.pdv:operate` |
| `POST` | `/m/varejo/caixa/abrir` | `varejo.pdv:operate` |
| `POST` | `/m/varejo/caixa/:id/fechar` | `varejo.pdv:close` |
| `POST` | `/m/varejo/caixa/:id/movimentos` | `varejo.pdv:operate` |
| `GET` | `/m/varejo/caixa/:id/resumo` | `varejo.pdv:operate` |
| `GET` | `/m/varejo/grade/eixos` | `core.products:view` |
| `POST` | `/m/varejo/grade/eixos` | `varejo.grade:manage` |
| `POST` | `/m/varejo/grade/eixos/:axisId/valores` | `varejo.grade:manage` |
| `POST` | `/m/varejo/grade/gerar` | `varejo.grade:manage` |
| `GET` | `/m/varejo/grade/:productId/estoque` | `core.stock:view` |
| `GET` | `/m/varejo/etiquetas/modelos` | `varejo.etiquetas:print` |
| `POST` | `/m/varejo/etiquetas/modelos` | `varejo.etiquetas:print` |
| `POST` | `/m/varejo/etiquetas/lotes` | `varejo.etiquetas:print` |
| `GET` | `/m/varejo/etiquetas/lotes/:id` | `varejo.etiquetas:print` |
| `GET` | `/m/varejo/etiquetas/lotes/:id/zpl` | `varejo.etiquetas:print` |
| `GET` | `/m/varejo/etiquetas/lotes/:id/pdf` | `varejo.etiquetas:print` |
| `POST` | `/m/varejo/etiquetas/lotes/:id/impresso` | `varejo.etiquetas:print` |
| `GET` | `/m/varejo/vendedores` | `varejo.comissoes:view` |
| `POST` | `/m/varejo/vendedores` | `varejo.comissoes:manage` |
| `PATCH` | `/m/varejo/vendedores/:id` | `varejo.comissoes:manage` |
| `GET` | `/m/varejo/comissoes` | `varejo.comissoes:view` |
| `GET` | `/m/varejo/comissoes/regras` | `varejo.comissoes:view` |
| `POST` | `/m/varejo/comissoes/regras` | `varejo.comissoes:manage` |
| `DELETE` | `/m/varejo/comissoes/regras/:id` | `varejo.comissoes:manage` |
| `POST` | `/m/varejo/comissoes/aprovar` | `varejo.comissoes:manage` |
| `POST` | `/m/varejo/comissoes/pagar` | `varejo.comissoes:manage` |
| `GET` | `/m/varejo/devolucoes` | `varejo.devolucoes:manage` |
| `POST` | `/m/varejo/devolucoes` | `varejo.devolucoes:manage` |
| `GET` | `/m/varejo/devolucoes/vales/:customerId` | `varejo.pdv:operate` |
| `GET` | `/m/varejo/relatorios/vendedores` | `varejo.relatorios:view` |
| `GET` | `/m/varejo/relatorios/horas` | `varejo.relatorios:view` |
| `GET` | `/m/varejo/relatorios/abc` | `varejo.relatorios:view` |
| `GET` | `/m/varejo/relatorios/sem-giro` | `varejo.relatorios:view` |

## Catálogo de permissões (74)

| Chave | Descrição | Módulo |
|---|---|---|
| `core.tenant:manage` | Gerir empresa e módulos | core |
| `core.users:view` | Ver usuários | core |
| `core.users:manage` | Criar/editar usuários | core |
| `core.roles:manage` | Gerir perfis e permissões | core |
| `core.customers:view` | Ver clientes | core |
| `core.customers:manage` | Criar/editar clientes | core |
| `core.products:view` | Ver produtos | core |
| `core.products:manage` | Criar/editar produtos | core |
| `core.stock:view` | Ver estoque | core |
| `core.stock:move` | Movimentar estoque | core |
| `core.orders:view` | Ver pedidos/vendas | core |
| `core.orders:create` | Criar pedidos/vendas | core |
| `core.orders:cancel` | Cancelar pedidos/vendas | core |
| `core.finance:view` | Ver financeiro | core |
| `core.finance:manage` | Lançar/baixar títulos | core |
| `core.purchases:view` | Ver compras e fornecedores | core |
| `core.purchases:manage` | Criar/receber compras | core |
| `core.suppliers:manage` | Cadastrar fornecedores | core |
| `core.payments:manage` | Cobrar online (PIX/link) | core |
| `core.webhooks:manage` | Integrações (webhooks) | core |
| `core.billing:manage` | Gerir assinatura e pagamento | core |
| `varejo.pdv:operate` | Operar PDV (abrir caixa, vender) | VAREJO |
| `varejo.pdv:close` | Fechar caixa | VAREJO |
| `varejo.grade:manage` | Gerir grades (tamanho/cor) | VAREJO |
| `varejo.etiquetas:print` | Gerar etiquetas | VAREJO |
| `varejo.comissoes:view` | Ver comissões | VAREJO |
| `varejo.comissoes:manage` | Gerir vendedores e regras | VAREJO |
| `varejo.devolucoes:manage` | Registrar devoluções e trocas | VAREJO |
| `varejo.relatorios:view` | Ver relatórios da loja | VAREJO |
| `food.salao:operate` | Operar salão (mesas, comandas, pedidos) | FOOD |
| `food.salao:manage` | Cadastrar mesas e áreas | FOOD |
| `food.salao:close` | Fechar conta | FOOD |
| `food.cozinha:view` | Ver fila da cozinha (KDS) | FOOD |
| `food.cozinha:update` | Mover tickets da cozinha | FOOD |
| `food.delivery:operate` | Despachar entregas | FOOD |
| `food.delivery:manage` | Cadastrar entregadores e zonas | FOOD |
| `food.cardapio:manage` | Editar cardápio | FOOD |
| `food.relatorios:view` | Ver relatórios do restaurante | FOOD |
| `gym.planos:view` | Ver planos | ACADEMIA |
| `gym.planos:manage` | Criar/editar planos | ACADEMIA |
| `gym.matriculas:view` | Ver matrículas, frequência e painel | ACADEMIA |
| `gym.matriculas:manage` | Cancelar/pausar/trocar matrículas | ACADEMIA |
| `gym.acesso:operate` | Registrar check-in na recepção | ACADEMIA |
| `gym.acesso:manage` | Gerir credenciais e dispositivos | ACADEMIA |
| `gym.turmas:view` | Ver agenda de turmas e reservar | ACADEMIA |
| `gym.turmas:manage` | Gerir turmas e fazer chamada | ACADEMIA |
| `svc.os:view` | Ver OS e painel da oficina | SERVICOS |
| `svc.os:update` | Mover status da OS | SERVICOS |
| `svc.veiculos:manage` | Cadastrar veículos | SERVICOS |
| `svc.catalogo:manage` | Gerir catálogo de serviços | SERVICOS |
| `svc.agenda:operate` | Agendar e atender agenda | SERVICOS |
| `svc.relatorios:view` | Ver relatórios da oficina | SERVICOS |
| `bel.agenda:operate` | Agendar e atender | BELEZA |
| `bel.cadastro:manage` | Cadastrar profissionais e serviços | BELEZA |
| `bel.pacotes:manage` | Criar pacotes de sessões | BELEZA |
| `bel.comissoes:view` | Ver comissões dos profissionais | BELEZA |
| `bel.comissoes:manage` | Pagar comissões | BELEZA |
| `bel.relatorios:view` | Ver relatórios do salão | BELEZA |
| `pet.pets:view` | Ver pets e tutores | PET |
| `pet.pets:manage` | Cadastrar pets | PET |
| `pet.banho:operate` | Agendar e tocar banho e tosa | PET |
| `pet.vet:view` | Ver prontuário, vacinas e lembretes | PET |
| `pet.vet:manage` | Registrar atendimento e vacina | PET |
| `pet.relatorios:view` | Ver relatórios do pet shop | PET |
| `cli.agenda:operate` | Agendar, receber e cobrar consultas | CLINICA |
| `cli.cadastro:manage` | Cadastrar profissionais | CLINICA |
| `cli.prontuario:view` | Ler prontuário | CLINICA |
| `cli.prontuario:manage` | Escrever no prontuário | CLINICA |
| `cli.convenios:manage` | Gerir convênios e repasses | CLINICA |
| `cli.relatorios:view` | Ver relatórios da clínica | CLINICA |
| `hot.reservas:operate` | Reservar, fazer check-in e check-out | HOTEL |
| `hot.quartos:manage` | Cadastrar quartos e diárias | HOTEL |
| `hot.governanca:operate` | Marcar limpeza e manutenção | HOTEL |
| `hot.relatorios:view` | Ver ocupação e diária média | HOTEL |

## Jobs

| Nome | Intervalo |
|---|---|
| core.outbox-dispatch | 1 min |
| core.payments-expire | 5 min |
| core.billing-cycle | 15 min |
| core.perfis-modelo | 1440 min |
| gym.cobranca-recorrente | 360 min |
| gym.gerar-sessoes | 720 min |

## Eventos (webhooks / Socket.IO)

`order.created`, `order.status`, `order.paid`, `stock.low`, `kitchen.ticket`, `delivery.status`, `gym.access`, `os.status`, `purchase.received`, `payment.paid`.

Webhook: POST JSON `{ id, type, occurredAt, tenantId, data }` com `X-FC-Signature: sha256=<HMAC-SHA256 do corpo com o segredo>`, `X-FC-Event`, `X-FC-Event-Id`. Retry com backoff (1m, 5m, 30m, 2h, 12h).
