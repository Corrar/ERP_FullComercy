# MEMORY — FullComercy

> Memória do projeto: decisões, lições pagas com bug, fatos do ambiente e glossário. Leia antes
> de mexer; acrescente quando aprender algo que o próximo não deve pagar de novo.

## 1. Origem e mandato

- Pedido original: arquiteto de software sênior; ERP SaaS modular e multi-tenant em Node,
  TypeScript e Prisma; núcleo universal + módulos Varejo, Food & Delivery, Academia,
  Automotivo/Serviços; `tenant_id` em todas as tabelas; separação `routes/controllers/services`;
  service de venda genérico que escolhe o módulo pela empresa logada.
- Base de inspiração: repos Fluxo Royale 5.0 (back em Express 5 + `pg`, front em React/Vite).
  **Nada foi escrito neles**; só o repo `Corrar/ERP_FullComercy`, branch `claude/clever-hypatia-lpr8gw`.
- Regra permanente de credencial herdada do Fluxo (ver `RULES.md` §0 e `CLAUDE.md`).

## 2. Decisões que não se revisitam sem motivo novo

Ver `ARCHITECTURE.md` §7. Em uma linha cada: banco único com RLS; FK composta; sem `SetNull`;
variante sempre existe; dois clients/dois papéis; permissão como texto; pedido único com
estratégia; outbox em tabela; front sem framework; monorepo.

## 3. Lições pagas com bug (e onde está a correção)

| Sintoma | Causa | Correção |
|---|---|---|
| Escritas raw recusadas pelo RLS dentro de `tenantTransaction` | `set_config` rodava antes do escopo existir; a extensão mandava o GUC para um lote à parte | escopo entra antes do `set_config` (`infra/prisma.ts`) |
| `addItems` não achava variante; preço do cardápio não aplicava na 2ª rodada | `ctx().db` usado dentro da transação roda na conexão de fora, sem GUC → vazio em silêncio | extensão detecta `__internalParams.transaction.kind === 'itx'` e redireciona para a transação |
| Comissão não gerada na venda paga na criação | `afterCreate` (cria `ret_sales`) rodava depois do pagamento que transita para COMPLETED | `afterCreate` antes dos pagamentos (`order.service.ts`) |
| Adesão de plano com `items: []` dava 400 | validação de itens vazios antes de a estratégia injetar linhas | validar depois de `strategy.price` |
| Conta da comanda cobrava taxa sobre a taxa ao reler | pedido FEE entrava na base | `contaDaComanda` separa taxa materializada |
| Todo service virou `any` (5 erros implicit-any) | ciclo de tipos `TenantTx ← TenantDb ← prismaForTenant ← txScope` | `TxScope.tx: unknown` |
| 31/jan + 3 meses = 1º/mai | `setMonth` estoura fim de mês | `somarCiclo` fixa no último dia (teste unitário pegou) |
| `moduleData` sumia depois de criado | não era persistido | guardado em `metadata.moduleData`; `draftFromOrder()` relê |
| Prisma CLI "permission denied for _prisma_migrations" | CLI usava a URL do tenant | `scripts/prisma-admin.js` troca pela URL de plataforma |
| Teste de CSV falhava com BOM | `fetch().text()` remove o BOM | asserção pelo conteúdo, não pelo BOM |
| Teste de webhook falhava em rodadas seguintes | webhooks antigos apontando para porta morta no mesmo tenant | tenant novo por rodada |
| `unit_cost` vinha `'60.0000'` | `Decimal(14,4)::text` | comparar `Number()` |
| `items: { create: [{ tenantId, … }] }` dava "Unknown argument tenantId" | create aninhado sob FK composta herda o tenant do pai | não passar `tenantId` no aninhado (`billing.service.ts`) |
| Teste de suspensão passava sozinho e falhava na suíte | o ciclo de cobrança varre TODAS as empresas; outro teste já tinha renovado esta | viajar a partir do `currentPeriodEnd` real, não de data fixa |
| PDV dava 403 em `/m/varejo/vendedores` numa empresa sem "Comissões" | o PDV buscava vendedores sempre | busca e campo só com `can('varejo.comissoes:view')` |
| Google simulado no login mandava GET com e-mail na URL | Modal renderizado DENTRO do `<form>` do login (form dentro de form) | `Modal` por portal no `<body>` + `stopPropagation` no submit |
| `npm run docs:api` falhava com ENOENT | caminho relativo ao cwd do workspace (`apps/api`) | caminho a partir de `__dirname` |
| `npm start` da API não achava o arquivo | `rootDir: "."` no tsconfig gera `dist/src/server.js` | `start`/`main` apontam para `dist/src/` |
| RLS não aplicava em banco gerenciado | `GRANT … TO app_rw` falha quando o papel não existe | `apply-rls.js` cria `app_rw NOLOGIN` se faltar |
| Railway: "Deploys have been paused temporarily" ao criar projeto (21/10/2026) | bloqueio da conta/plataforma, não do código | API + banco foram para o Render; `apps/api/railway.json` fica pronto |
| (prevenção) cold start do Neon > 5 s do `connect_timeout` padrão do Prisma | compute adormecido | `withConnectTimeout` (20 s) em `infra/db-url.ts` e nos scripts |
| Postgres local caía "sozinho" | `pkill -f` com padrão que casava o próprio shell (exit 144) matou a sessão que iniciou o banco | iniciar com `setsid`; matar por `pgrep -f "[p]adrao"` |

## 4. Fatos do ambiente de desenvolvimento desta sessão

- Postgres 16 local em `127.0.0.1:5433`, cluster `/var/lib/postgresql/fc/data`, auth `trust`
  (sem senha em lugar nenhum). Papéis: `postgres` (plataforma) e `app_rw` (tenant, sem bypass).
  Subir: `setsid su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/fc/data -l /var/lib/postgresql/fc/pg.log start -w"`.
- `apps/api/.env` (ignorado pelo git) aponta `DATABASE_URL` para `app_rw` e `DATABASE_ADMIN_URL`
  para `postgres`. `JOBS_ENABLED=0` em teste.
- Seed cria `loja-demo` (VAREJO), `burger-demo` (FOOD), `fit-demo` (ACADEMIA), `oficina-demo`
  (SERVICOS), `posto-demo` (VAREJO+FOOD, padrão VAREJO); admin `admin@<slug>.local`, senha
  `SEED_ADMIN_PASSWORD` (`Demo-12345678` no dev). Seed não tem assinatura: plano não corta nada.
- Loja em dev: `.env` com `GOOGLE_AUTH_MOCK=1` (Google simulado) e `BILLING_MOCK_WEBHOOK_TOKEN`.
  Cartões de teste do mock: final `0002` recusa ao cadastrar, `0341` cadastra e recusa a cobrança,
  `4242 4242 4242 4242` aprova. Webhook mock: `POST /public/billing/webhooks/mock` com
  `x-billing-token` e `{ kind: 'invoice', providerRef, status: 'PAID' }` ou
  `{ kind: 'pix_authorization', authorizationId, status: 'AUTHORIZED' }`.
- Chromium do Playwright em `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (passar
  `CHROMIUM_PATH` se a versão do runner divergir). Playwright sobe API em 3300 e Vite em 5180.
- Prisma 6.19; `prisma.config.ts` com `datasource.url` não bastou para o CLI — o wrapper resolve.

## 4.1 Deploy (homologação)

- Vercel: time `corrars-projects`, projeto `erp-modular` (`prj_rblBxDsI5N6bUjO1n4A6q4nyZiS1`), raiz
  `apps/web`, `VITE_API_URL=https://erp-modular-api.onrender.com`. A branch de produção da Vercel é
  a default do repo; o deploy deste branch foi disparado como produção pela API da Vercel.
- Render: workspace `tea-d4sqarumcj7s73crb7lg`, serviço `srv-dbcchrss728c73enbuo0` (só a API).
  Variáveis por mescla (`update_environment_variables`), nunca listando valores.
- Banco: Neon, org `org-snowy-queen-85074843`, projeto `ERP-Modular` (`empty-haze-70902164`),
  branch `homologacao`, banco `erp_modular`, papel `erp_owner`, `aws-us-east-2`. Criado pelo
  conector (`create_project` não devolve credencial). O executor NÃO chama `get_connection_string`
  nem lê/cola o `DATABASE_URL`: quem cola é o responsável, a URL **direta** (migration não vai pelo
  pooler, ver skill `regras-neon`). O Postgres `erp-modular-db` do Render ficou vazio e sobrando.
- CORS: `CORS_ORIGINS` aceita curinga de um rótulo (`https://erp-modular-*-corrars-projects.vercel.app`).

## 5. Como rodar e verificar (atalho)

```bash
npm install
npm run prisma:deploy && npm run db:rls && npm run db:seed
npm run typecheck && npm test                    # sem banco: 26 unit
npm run test:e2e                                 # com banco: 26 e2e API
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:ui   # 5 navegador
npm run docs:api                                 # regenera docs/API.md (265 rotas)
```

## 6. Glossário

- **Tenant**: a empresa cliente do SaaS. **Plataforma**: quem opera o SaaS.
- **Módulo**: pacote de nicho ativável por empresa (`VAREJO`, `FOOD`, `ACADEMIA`, `SERVICOS`).
- **Estratégia de venda**: objeto que diz como um módulo trata o pedido genérico.
- **Variante**: a unidade vendável/estocável (SKU); todo produto tem pelo menos uma.
- **GUC**: `app.tenant_id`, a variável de sessão do Postgres que o RLS lê.
- **Outbox**: tabela de eventos duráveis a entregar.
- **Comanda**: agrupa pedidos (rodadas) de uma mesa até fechar a conta.
- **OS**: ordem de serviço; é um pedido com extensão `svc_service_orders`.
- **Conta (do comprador)**: quem compra na loja; vive na plataforma e abre uma ou mais empresas.
- **Função**: item vendável do catálogo da loja (preço + chaves de permissão).
- **Plano**: as funções contratadas por uma empresa (`core_subscription_items`).
- **Vale**: título a pagar de origem `RETURN` em aberto, abatido numa troca.

## 7. Onde está cada coisa

| Quero | Olho em |
|---|---|
| regra de escolha do módulo | `apps/api/src/core/orders/sales-strategy.ts` |
| isolamento e transação | `apps/api/src/infra/prisma.ts`, `apps/api/prisma/sql/001_rls_tenant.sql` |
| catálogo de permissões | `apps/api/src/core/rbac/permissions.ts` + `permissions` em cada `modules/*/index.ts` |
| rotas e permissão por rota | `docs/API.md` |
| menu do front | `apps/web/src/app/modules.ts` |
| preço, funções e o que cada uma libera | `apps/api/src/core/billing/catalog.ts` |
| checkout, ciclo de cobrança, webhook | `apps/api/src/core/billing/billing.service.ts` |
| conta do comprador e Google | `apps/api/src/core/account/` |
| loja (telas) | `apps/web/src/store/` |
| identidade (nome/marca) | `apps/web/src/app/brand.ts` + `--brand` em `styles.css` |
| o que falta | `TASKS.md` |
