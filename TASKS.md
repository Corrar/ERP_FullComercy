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
- [x] CI verde de verdade: gera o Prisma Client antes do typecheck (antes falhava sempre ali); 40 unit, 26 e2e API, 6 Playwright
- [x] Módulos Beleza, Pet, Clínica e Hotelaria (API, telas, catálogo, e2e e navegador; ver PRD §5.6–5.9)
- [x] Telas que a loja vendia sem existir: Trocas e devoluções (vale abatido no PDV por "Usar vale"), regras de comissão, zonas de entrega por CEP, cadastro de entregador e acerto
- [x] Telas que faltavam sobre rotas prontas: estoque (movimento, transferência, armazéns, inventário), financeiro (editar, cancelar, baixa com conta, cadastros), DRE com PDF, auditoria, usuários (exceções, nova senha), integrações (entregas, reenvio, intenções), compras (itens do rascunho, fornecedor inativo), Food (ficha técnica, adicionais, transferir/cancelar comanda, mesas), Serviços (catálogo, checklist, técnico, anexos, ficha do veículo), Academia (reservas e chamada, planos, credenciais, cobrança manual, pico/frequência), Varejo (eixos da grade, editar/desativar vendedor, etiqueta impressa)
- [x] Acompanhamento público em tempo real (token por pedido, sala só do pedido), e-mails em HTML com a marca da empresa (cor e logo na tela Empresa), paginação no núcleo (clientes, produtos, pedidos, títulos, compras, razão do estoque, auditoria)
- [x] Pós-compra pronto: perfis da equipe por módulo (modelo), e-mail de boas-vindas com dados de acesso e link de senha, dados de acesso na tela de conclusão; produção sem SMTP não sobe
- [x] Modelo de perfis aplicado nas empresas antigas (job `core.perfis-modelo`, uma vez por empresa, só perfil vazio)
- [x] Primeiros passos no painel: roteiro por módulo comprado, marcado pelos dados da empresa, "Fazer agora" leva à tela, dispensável (volta em Empresa)
- [x] Conta do comprador: esqueci a senha da conta (leva junto a senha das empresas que usam a da conta), reenviar dados de acesso, assinatura e faturas de cada empresa na Minha conta
- [x] Testes: 43 unit, 41 e2e API, 20 Playwright

- [x] Homologação no ar: front na Vercel (`erp-modular`), API no Render (free), banco no Neon (`ERP-Modular`)

- [x] Stripe (cartão, SetupIntent + 3-D Secure, cobrança off_session idempotente, webhook assinado) como provedor da assinatura
- [x] Cloudflare Turnstile (cadastro, login, equipe, esqueci a senha, checkout) e CSP/HSTS no front

## P0 — antes de produção

- [x] SMTP no Render pelo Resend (smtp.resend.com:465, chave só de envio) — em MODO TESTE: remetente `onboarding@resend.dev`, que só entrega para o e-mail da conta Resend
- [ ] Domínio próprio no Resend (registros SPF/DKIM no DNS) e trocar `MAIL_FROM` no Render — sem isso o cliente real não recebe os dados de acesso nem o "esqueci a senha" — passo do responsável
- [x] Chaves do Stripe (teste) no Render e `BILLING_PROVIDER=stripe` — conferido pela API no ar (catálogo: provider `stripe`, `pk_test_`)
- [ ] Chaves do Turnstile no Render (`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`; widget na Cloudflare para os domínios da Vercel) — passo do responsável
- [ ] Ativar boleto e Pix na conta Stripe e implementar no adaptador (hoje só cartão; Pix Automático o Stripe não oferece)
- [ ] WAF/DDoS da Cloudflare exige domínio próprio com DNS na Cloudflare (proxy laranja na frente da Vercel e da API)

- [x] `DATABASE_URL` do Neon no `erp-modular-api` (log: `[db] ok`)
- [ ] Apagar o Postgres `erp-modular-db` do Render (vazio, substituído pelo Neon; expiraria em 20/11/2026)
- [ ] Produção de verdade: `APP_STAGE=production`, gateway real, `GOOGLE_CLIENT_ID`, papel `app_rw` com LOGIN e senha (separar `DATABASE_ADMIN_URL`)
- [ ] Decidir se a homologação abre ao público (hoje a Vercel exige login do time)

- [ ] Gateway REAL da assinatura (cartão tokenizado pelo SDK JS do gateway, boleto, Pix Automático) em
      `core/billing/providers/` + `tokenizeCard` em `apps/web/src/lib/billing.ts`
- [x] `GOOGLE_CLIENT_ID` na homologação (login real com Google aceito pela API em 21/10)
- [ ] `GOOGLE_CLIENT_ID` de produção (origem do domínio próprio autorizada no console do Google)
- [ ] Nota fiscal de serviço da mensalidade do SaaS

- [ ] Gateway de pagamento real (PIX dinâmico de um banco/PSP) como provedor em `core/payments/providers/`
- [ ] Rotação de `APP_ENCRYPTION_KEY` (recifrar segredos) e política de backup/restore do banco
- [ ] Papéis de banco em produção criados à mão (plataforma `BYPASSRLS`, tenant comum) e `db:rls` no deploy
- [ ] Limites por plano da plataforma (usuários, pedidos/mês) e bloqueio por inadimplência do SaaS
- [ ] Termos de uso / LGPD: exportação e exclusão de dados do cliente final (pedidos públicos guardam telefone)

## P1 — próxima rodada

- [ ] Identidade visual (nome, logo, cor) — trocar `app/brand.ts`, `--brand` e o ícone
- [x] Proporcional (pro rata) ao ligar função no meio do mês pago: só as funções novas, pelos dias que faltam; cartão cobra antes de ligar (recusou, nada muda); prévia na tela antes de salvar; remover não devolve e o valor menor vale na próxima fatura
- [x] E-mails de aviso da cobrança: fim do teste em 2 dias, fatura disponível (boleto/Pix), recusa (1ª e última tentativa), suspensão e comprovante — uma vez cada (`core_billing_notices`)
- [x] Painel do dia por permissão já cortada pelo plano: cada número só para quem pode vê-lo (o Caixa não vê "a receber"; sem Comissões no plano, sem "comissões pendentes"); chaves na conferência de boot

- [ ] Emissão fiscal por adaptador (NFC-e no PDV, NF-e na compra) ouvindo `order.status` COMPLETED
- [ ] Socket.IO entre instâncias (adapter Redis) e fila para o outbox quando houver várias réplicas
- [ ] Testes de navegador para Food (KDS), Academia (recepção) e Serviços (kanban → OS) — o salão (mesas) já tem

## P2 — quando couber

- [ ] Importação CSV de produtos/clientes
- [ ] Impressão de cupom não fiscal (ESC/POS) no PDV e na cozinha
- [ ] App do entregador (PWA) com rota e confirmação de entrega
- [ ] Avaliação física e treino na academia; aulas com lista de espera
- [ ] Garantia e retorno programado na oficina (lembrete por WhatsApp)
- [ ] Multi-loja por empresa (armazém por filial já existe; falta caixa/relatório por filial)
- [ ] Acessibilidade: navegação por teclado no KDS, `aria-live` em toasts e status
