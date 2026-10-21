# CLAUDE.md — FullComercy (ERP SaaS modular e multi-tenant)

**Leia este arquivo no início de CADA sessão.** Ele guarda as regras permanentes da casa para o
executor, que é a sessão de IA que trabalha neste repositório.

---

## REGRA PERMANENTE — credencial e estado de produção

É a mesma regra dos repositórios Fluxo Royale 5.0 (back e front), herdada por decisão do
arquiteto em 03/10/2026.

### 1. O executor NUNCA lê `~/.fluxo-conexoes/` nem qualquer connection string de produção.

- Vale para só-leitura.
- Vale mesmo quando houver prática antiga registrada em memória, skill, relatório ou script.

### 2. Estado de produção vem só destas fontes

- **(a)** rota HTTP, com token do Bruno;
- **(b)** bloco que o Bruno roda e cola;
- **(c)** uma URL só-`SELECT` que o Bruno criar depois, e só com autorização explícita do arquiteto
  na rodada.

Se nenhuma das três serve para a medição, **PARE** e peça ao Bruno a rota ou o bloco.

### 3. Credencial nunca vai como argumento de processo.

Só por variável de ambiente da sessão ou por `PGPASSFILE`. Argumento fica na linha de comando do
processo, legível por outros programas da mesma máquina.

### A trava do harness

`.claude/settings.json` tem `permissions.deny` para a pasta e para qualquer caminho que contenha
`.fluxo-conexoes`. ⚠ A trava olha a linha de comando: um script que guarde o caminho dentro dele
não é barrado. Esse caso quem segura é a regra, não a trava.

---

## REGRAS DE ARQUITETURA DESTE REPOSITÓRIO

Documentos de governança na raiz: `PRD.md`, `ARCHITECTURE.md`, `RULES.md` (versão completa
destas regras), `DESIGN.md`, `TASKS.md`, `MEMORY.md` (leia as lições antes de mexer).
Detalhe e justificativa em `docs/ARQUITETURA.md`. O resumo que não pode ser esquecido:

1. **Tudo é por tenant.** Toda tabela (menos `core_tenants` e as de plataforma `plat_*`, que existem
   antes da empresa) tem `tenant_id`; toda FK de negócio é composta `(tenant_id, id)`; toda unicidade
   é `@@unique([tenantId, …])`. `plat_*` só pelo client de plataforma e sem GRANT para o papel do tenant.
2. **Código de negócio usa `ctx().db`, nunca `prisma` direto.** O client base só serve a login,
   jobs de plataforma e seed. Passe `tenantId` explicitamente no `create` de topo (o tipo exige);
   a extensão é rede de segurança, não o caminho.
3. **Toda escrita de negócio passa por `tenantTransaction`** (arma o RLS com `SET LOCAL`).
4. **Módulo só ESTENDE o core.** Nunca adiciona coluna em tabela `core_*`; cria tabela própria com
   prefixo do módulo e, para falar de pedido, uma extensão 1:1 de `core_orders`.
5. **Venda nasce em `POST /orders`, para todos os módulos.** O módulo é escolhido por
   `salesStrategies.resolve()`. Módulo expõe rotas só do que é exclusivo dele, em `/m/<módulo>`.
6. **Estoque e dinheiro são do core.** Módulo chama `stock.service` e `finance.service`; não
   reimplementa saldo nem cria `FinanceEntry` por fora.
7. **Permissão é texto no catálogo do código.** Rota que cobra chave fora do catálogo derruba o
   boot (`assertAllRequiredKeysAreDeclared`).
8. **Service não conhece HTTP.** Lança `AppError`; quem traduz é `shared/http.ts`.

### Front (`apps/web`)

9. **O front não decide acesso; ele só esconde.** `can()`/`hasModule()` filtram menu e rotas, mas a
   API é quem nega (403). Nunca duplicar regra de negócio no front.
10. **Toda chamada passa por `lib/api.ts`** (Bearer, refresh, `ApiError`). Nada de `fetch` solto.
11. **Módulo novo no front = pasta em `src/modules/<módulo>` + uma linha em `app/modules.ts`.** Suas
    telas de venda usam `POST /orders` com `moduleData`, como no back.
12. **Tempo real por `useSocketEvent`**, nunca `setInterval` para "atualizar a tela".

### Loja de módulos e assinatura

13. **Preço e plano só no servidor** (`core/billing/catalog.ts`). O front mostra o `quote`; o checkout
    recalcula. Função nova vendável = entrada no catálogo com as chaves que libera (o teste de
    cobertura derruba chave sem função).
14. **O plano corta permissão** em `rbac.service` (`canUse`): nem o admin usa o que não contratou.
    Empresa sem assinatura (seed/plataforma) não tem corte.
15. **Cartão nunca passa pela API**: com Stripe, o número fica no iframe de js.stripe.com (SetupIntent +
    3-D Secure no navegador); a API guarda `pm_…`, bandeira e final. Simuladores (`BILLING_PROVIDER=mock`,
    `GOOGLE_AUTH_MOCK=1`) são recusados em produção; chave Stripe de teste em produção e chave real fora
    dela também (`configProblems` em `config/env.ts`).
16. **Visual**: tokens do `styles.css` (referência: design do Fluxo 5.0), cor do módulo por `--accent`,
    marca neutra em `app/brand.ts` até a identidade nascer.
17. **Anti-robô Cloudflare Turnstile** (`shared/turnstile.ts`, `requireHuman`) em cadastro, login, login
    da equipe, esqueci a senha e checkout. Falha FECHADA; obrigatório em produção.
18. **CSP e cabeçalhos de segurança** em `apps/web/vercel.json`. Domínio novo no front (script, iframe,
    API) entra na CSP — e a jornada é conferida sob a CSP antes de publicar (MEMORY §4.1).
19. **Toda função vendável tem vídeo de demonstração** gravado da tela REAL (`apps/web/demos`,
    `npm run demos`). Função nova no catálogo = roteiro novo; tela de função mudou = regravar. Script
    de terceiro (Stripe, Turnstile, Google) monta em elemento SEM filhos React (MEMORY §3).
