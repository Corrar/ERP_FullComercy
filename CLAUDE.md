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

Detalhe e justificativa em `docs/ARQUITETURA.md`. O resumo que não pode ser esquecido:

1. **Tudo é por tenant.** Toda tabela (menos `core_tenants`) tem `tenant_id`; toda FK de negócio é
   composta `(tenant_id, id)`; toda unicidade é `@@unique([tenantId, …])`.
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
