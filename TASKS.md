# TASKS — FullComercy

> Backlog vivo. Marque ao concluir; mova lições para `MEMORY.md`. Prioridade: P0 bloqueia
> produção, P1 próxima rodada, P2 quando couber.

## Feito (corte atual)

- [x] Schema Prisma core + 4 módulos, `tenant_id` em tudo, FK composta, 4 migrations
- [x] Multi-tenancy em 3 camadas (contexto, extensão Prisma, RLS com dois papéis) provado por teste
- [x] Auth (login, refresh rotativo, esqueci/redefinir, convite), RBAC com catálogo em código
- [x] Clientes, produtos/variantes, estoque (motor, mínimo, transferência, inventário físico)
- [x] Compras (recebimento parcial, custo médio, a pagar, devolução, sugestão), financeiro básico
- [x] Pedido genérico com estratégia por módulo; itens em pedido aberto; painel de vendas
- [x] Varejo, Food, Academia, Serviços completos conforme `PRD.md` §5
- [x] Eventos duráveis, webhooks HMAC com retry, Socket.IO, notificações, pagamento online (mock/manual)
- [x] Plataforma (onboarding por API), settings da empresa, cifra de segredos, CSV, auditoria
- [x] Front React: shell gated, núcleo, 4 módulos, vitrine pública, detalhes/edição
- [x] Testes: 17 unit, 18 e2e API, 4 Playwright; CI completo; Docker compose com web
- [x] Docs: `docs/ARQUITETURA.md`, `docs/API.md` gerado, PRD/ARCHITECTURE/RULES/DESIGN/MEMORY

- [x] Loja de módulos: escolha do comércio, configurador com preço por função, prévia do menu, carrinho
- [x] Conta do comprador (senha + Google), checkout com 7 dias grátis, cartão/boleto/Pix Automático (mock)
- [x] Plano corta permissão (403 `NOT_IN_PLAN`), ciclo de cobrança, atraso → suspensão → volta ao pagar
- [x] Front no visual do Fluxo 5.0 (tema claro/escuro, sidebar com troca de módulo, gaveta no celular)
- [x] Testes: 26 unit, 26 e2e API, 5 Playwright

- [x] Homologação no ar: front na Vercel (`erp-modular`), API no Render (free), banco no Neon (`ERP-Modular`)

- [x] Stripe (cartão, SetupIntent + 3-D Secure, cobrança off_session idempotente, webhook assinado) como provedor da assinatura
- [x] Cloudflare Turnstile (cadastro, login, equipe, esqueci a senha, checkout) e CSP/HSTS no front

## P0 — antes de produção

- [ ] Colar no Render as chaves do Stripe (teste) e do Turnstile e trocar `BILLING_PROVIDER` para `stripe` — passo do responsável
- [ ] Ativar boleto e Pix na conta Stripe e implementar no adaptador (hoje só cartão; Pix Automático o Stripe não oferece)
- [ ] WAF/DDoS da Cloudflare exige domínio próprio com DNS na Cloudflare (proxy laranja na frente da Vercel e da API)

- [ ] Colar `DATABASE_URL` (Neon `ERP-Modular`, conexão direta, sem `-pooler`) no serviço `erp-modular-api` — passo do responsável
- [ ] Apagar o Postgres `erp-modular-db` do Render (vazio, substituído pelo Neon; expiraria em 20/11/2026)
- [ ] Produção de verdade: `APP_STAGE=production`, gateway real, `GOOGLE_CLIENT_ID`, papel `app_rw` com LOGIN e senha (separar `DATABASE_ADMIN_URL`)
- [ ] Decidir se a homologação abre ao público (hoje a Vercel exige login do time)

- [ ] Gateway REAL da assinatura (cartão tokenizado pelo SDK JS do gateway, boleto, Pix Automático) em
      `core/billing/providers/` + `tokenizeCard` em `apps/web/src/lib/billing.ts`
- [ ] `GOOGLE_CLIENT_ID` de produção (origem autorizada no console do Google)
- [ ] Nota fiscal de serviço da mensalidade do SaaS

- [ ] Gateway de pagamento real (PIX dinâmico de um banco/PSP) como provedor em `core/payments/providers/`
- [ ] Rotação de `APP_ENCRYPTION_KEY` (recifrar segredos) e política de backup/restore do banco
- [ ] Papéis de banco em produção criados à mão (plataforma `BYPASSRLS`, tenant comum) e `db:rls` no deploy
- [ ] Limites por plano da plataforma (usuários, pedidos/mês) e bloqueio por inadimplência do SaaS
- [ ] Termos de uso / LGPD: exportação e exclusão de dados do cliente final (pedidos públicos guardam telefone)

## P1 — próxima rodada

- [ ] Identidade visual (nome, logo, cor) — trocar `app/brand.ts`, `--brand` e o ícone
- [ ] Proporcional (pro rata) ao adicionar função no meio do ciclo; hoje o valor novo vale na próxima fatura
- [ ] E-mail de aviso: fim do teste em 2 dias, fatura gerada, pagamento recusado, suspensão
- [ ] Recuperar senha da CONTA do comprador (hoje só o "esqueci" do funcionário por empresa)
- [ ] Painel do dia esconder KPI de módulo cuja função não está no plano (ex.: comissões pendentes)

- [ ] Emissão fiscal por adaptador (NFC-e no PDV, NF-e na compra) ouvindo `order.status` COMPLETED
- [ ] Socket.IO entre instâncias (adapter Redis) e fila para o outbox quando houver várias réplicas
- [ ] Front: edição de itens de compra em rascunho, cancelamento de comanda, regras de comissão, zonas de entrega, catálogo de serviços, turmas (instrutor), checklist marcável
- [ ] Front: página pública de acompanhamento com atualização em tempo real (socket anônimo por pedido)
- [ ] Relatório DRE simples (receitas × despesas por categoria) e exportação PDF
- [ ] Templates de e-mail em HTML com marca da empresa
- [ ] Testes de navegador para Food (salão/KDS), Academia (recepção) e Serviços (kanban → OS)
- [ ] Paginação em todas as listagens do núcleo (hoje só pedidos) e no front

## P2 — quando couber

- [ ] Importação CSV de produtos/clientes
- [ ] Impressão de cupom não fiscal (ESC/POS) no PDV e na cozinha
- [ ] App do entregador (PWA) com rota e confirmação de entrega
- [ ] Avaliação física e treino na academia; aulas com lista de espera
- [ ] Garantia e retorno programado na oficina (lembrete por WhatsApp)
- [ ] Multi-loja por empresa (armazém por filial já existe; falta caixa/relatório por filial)
- [ ] Acessibilidade: navegação por teclado no KDS, `aria-live` em toasts e status
