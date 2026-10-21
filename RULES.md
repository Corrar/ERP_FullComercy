# RULES — FullComercy

> As regras da casa. O que não se negocia em código, revisão, teste e operação.
> `CLAUDE.md` é o resumo que a sessão de IA lê no início; este arquivo é a versão completa.

## 0. Credencial e produção (permanente)

1. Ninguém — pessoa ou IA — lê `~/.fluxo-conexoes/` nem connection string de produção.
2. Estado de produção vem só de: rota HTTP com token do responsável; bloco que o responsável
   roda e cola; URL só-`SELECT` criada pelo responsável com autorização explícita. Sem isso, PARE.
3. Credencial nunca vai como argumento de processo. Só variável de ambiente ou `PGPASSFILE`.
   (`scripts/prisma-admin.js` existe por isso.)
4. Segredo em JSON (token de catraca, chave de gateway) vai cifrado (`shared/crypto.ts`).
5. Log nunca imprime segredo, nem em pedaço. Auditoria HTTP mascara campos sensíveis.

## 1. Dados e tenant

6. Toda tabela nova (menos `core_tenants` e as de plataforma `plat_*` — conta do comprador, que
   existe antes da empresa; sem GRANT para o papel do tenant em `001_rls_tenant.sql`) tem `tenant_id`, `@@unique([tenantId, id])`, FK composta
   e unicidade por tenant. Prefixo de tabela diz o dono (`core_`, `ret_`, `food_`, `gym_`, `svc_`).
7. Nada de `onDelete: SetNull`. Cadastro desativa (`isActive=false`); filho morre com o pai (`Cascade`).
8. Dinheiro é `Decimal(14,2)`, quantidade `Decimal(14,3)`. Nunca `Float`. Aritmética em `shared/money.ts`.
9. Migration nasce por `npm run prisma:migrate` (como plataforma) e vai acompanhada de
   `npm run db:rls`. Migration nunca é editada depois de empurrada.

## 2. Código da API

10. Código de negócio usa `ctx().db`. `prisma` (plataforma) só em login, refresh, onboarding,
    snapshot de módulos, jobs e seed. Passe `tenantId` explicitamente no `create` de topo.
11. Toda escrita com mais de um passo passa por `tenantTransaction`. Dentro dela, use o `tx`;
    se um service de fora for chamado, a extensão redireciona, mas prefira passar o `tx`.
12. Módulo só estende o núcleo. Nunca coluna em `core_*`; pedido do módulo é extensão 1:1.
13. Venda nasce em `POST /orders`. Módulo não cria rota de "vender"; expõe só o exclusivo em `/m/<módulo>`.
14. Estoque só pelo `stock.service` (com `idempotencyKey`); dinheiro só pelo `finance.service`.
15. Service lança `AppError` com código; nunca `res.status`. Controller valida com zod via `parse()`.
16. Toda rota autenticada tem `requirePermission`; chave fora do catálogo derruba o boot.
    Rota pública tem rate limit próprio e autentica do jeito do caso (token do aparelho, assinatura).
17. Evento novo entra em `DomainEvents` (tipado) e no `TYPES` do outbox.
18. Comentário explica o **porquê** e o que foi **medido**, não o óbvio. Achado por teste vira
    comentário no ponto corrigido.

## 3. Código do front

19. O front não decide acesso; só esconde. `can()`/`hasModule()` filtram menu e rota; a API nega.
20. Toda chamada via `lib/api.ts`. Nada de `fetch` solto. Todo socket via `lib/socket.ts`.
21. Módulo novo = pasta em `src/modules/<módulo>` + uma linha em `app/modules.ts`.
22. Tempo real por `useSocketEvent`; nunca `setInterval` para atualizar tela.
23. Visual só por tokens/utilitários de `styles.css` e primitivas de `components/ui.tsx`.
24. Texto de interface em português do Brasil; status traduzidos por `format.ts`.

## 4. Testes

25. Unitário sem banco para regra pura (resolução de módulo, ciclo, placa, dinheiro, cifra, CSV).
26. e2e da API para todo fluxo de venda de módulo e para isolamento/RLS. e2e de navegador para
    os caminhos críticos de tela (login, PDV, vitrine). Suíte vermelha não entra.
27. Asserção discrimina: compara com valor esperado calculado (não "não lançou"), tem
    contra-prova (o que deve falhar, falha: 400/401/403/409 verificados) e dado único por rodada.
28. Teste que depende de estado de rodadas anteriores é bug do teste: use tenant novo ou sufixo.
29. "Flake" não é diagnóstico. Primeiro causa (nesta casa: banco caído, GUC fora de ordem).

## 5. Git e revisão

30. Branch de trabalho definida pela tarefa; nunca push em outra sem permissão.
31. Commit descreve o que mudou e **por quê**, em português, com achados dos testes. Sem
    identificador de modelo em commit, PR, comentário ou código.
32. Antes de empurrar: `npm run typecheck`, `npm test`, `npm run test:e2e` (com banco),
    `npm run build -w apps/web`, e `npm run docs:api` se mexeu em rota.
33. PR só quando pedido. Atualize `TASKS.md` (feito/pendente) e, se houver lição, `MEMORY.md`.

## 6. Definição de pronto

Uma funcionalidade está pronta quando: tem rota com permissão no catálogo, service com
`tenantTransaction` onde escreve, teste que a exercita ponta a ponta, tela (quando é de usuário)
gated pela permissão, entrada em `docs/API.md` regenerado, e, se mudou contrato, nota em
`ARCHITECTURE.md`/`docs/ARQUITETURA.md`.
