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
| Postgres local caía "sozinho" | `pkill -f` com padrão que casava o próprio shell (exit 144) matou a sessão que iniciou o banco | iniciar com `setsid`; matar por `pgrep -f "[p]adrao"` |

## 4. Fatos do ambiente de desenvolvimento desta sessão

- Postgres 16 local em `127.0.0.1:5433`, cluster `/var/lib/postgresql/fc/data`, auth `trust`
  (sem senha em lugar nenhum). Papéis: `postgres` (plataforma) e `app_rw` (tenant, sem bypass).
  Subir: `setsid su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/fc/data -l /var/lib/postgresql/fc/pg.log start -w"`.
- `apps/api/.env` (ignorado pelo git) aponta `DATABASE_URL` para `app_rw` e `DATABASE_ADMIN_URL`
  para `postgres`. `JOBS_ENABLED=0` em teste.
- Seed cria `loja-demo` (VAREJO), `burger-demo` (FOOD), `fit-demo` (ACADEMIA), `oficina-demo`
  (SERVICOS), `posto-demo` (VAREJO+FOOD, padrão VAREJO); admin `admin@<slug>.local`, senha
  `SEED_ADMIN_PASSWORD` (`Demo-12345678` no dev).
- Chromium do Playwright em `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (passar
  `CHROMIUM_PATH` se a versão do runner divergir). Playwright sobe API em 3300 e Vite em 5180.
- Prisma 6.19; `prisma.config.ts` com `datasource.url` não bastou para o CLI — o wrapper resolve.

## 5. Como rodar e verificar (atalho)

```bash
npm install
npm run prisma:deploy && npm run db:rls && npm run db:seed
npm run typecheck && npm test                    # sem banco: 17 unit
npm run test:e2e                                 # com banco: 18 e2e API
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:ui   # 4 navegador
npm run docs:api                                 # regenera docs/API.md (250 rotas)
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
- **Vale**: título a pagar de origem `RETURN` em aberto, abatido numa troca.

## 7. Onde está cada coisa

| Quero | Olho em |
|---|---|
| regra de escolha do módulo | `apps/api/src/core/orders/sales-strategy.ts` |
| isolamento e transação | `apps/api/src/infra/prisma.ts`, `apps/api/prisma/sql/001_rls_tenant.sql` |
| catálogo de permissões | `apps/api/src/core/rbac/permissions.ts` + `permissions` em cada `modules/*/index.ts` |
| rotas e permissão por rota | `docs/API.md` |
| menu do front | `apps/web/src/app/modules.ts` |
| o que falta | `TASKS.md` |
