# PRD — FullComercy

> Documento de requisitos do produto. O que o sistema é, para quem, e o que precisa fazer.
> Companheiros: `ARCHITECTURE.md` (como é feito), `RULES.md` (regras da casa), `DESIGN.md`
> (como se apresenta), `TASKS.md` (o que falta), `MEMORY.md` (o que aprendemos).

## 1. Visão

ERP SaaS **modular e multi-tenant** para pequenos e médios comércios brasileiros. Uma única
instalação atende qualquer tipo de negócio: a empresa cadastra-se, liga os módulos que usa e
opera a partir de um núcleo comum (clientes, produtos, estoque, financeiro, pedidos, usuários).

O produto nasce da arquitetura do Fluxo Royale 5.0 (back e front) e generaliza o que lá era
específico de uma fábrica para qualquer comércio, sem herdar código.

## 2. Problema

Comércios pequenos usam planilhas ou sistemas de nicho que não conversam entre si: o PDV não
sabe do financeiro, a academia não sabe do estoque de suplementos, a oficina controla OS num
caderno. Sistemas "completos" são caros, pesados e feitos para um nicho só. Quem tem dois
negócios (posto com conveniência e lanchonete) precisa de dois sistemas.

## 3. Público e personas

| Persona | Nicho | O que precisa |
|---|---|---|
| Dona de loja de roupas | Varejo | PDV rápido, grade tamanho×cor, etiquetas, comissão dos vendedores, troca/devolução |
| Gerente de hamburgueria | Food & Delivery | Mesas e comandas, cozinha organizada, entregadores, cardápio online com pedido |
| Dono de academia | Academia | Planos recorrentes, cobrança automática, catraca, frequência, turmas |
| Dono de oficina mecânica | Serviços | OS por placa, orçamento e aprovação, status do carro, agenda, peças |
| Operador da plataforma | SaaS | Criar empresas, ligar módulos, suspender, ver uso |

Em todas: um administrador da empresa gerencia usuários, perfis e permissões; funcionários têm
acesso só ao que o perfil permite.

## 4. Objetivos

1. **Um núcleo, vários nichos.** Toda empresa usa as mesmas telas de clientes, produtos,
   estoque, financeiro e pedidos; o nicho entra por módulo, sem poluir o núcleo.
2. **Isolamento total entre empresas**, garantido pelo banco (RLS), não só pela aplicação.
3. **Venda unificada.** PDV, comanda, adesão de plano e OS são o mesmo "pedido" por baixo; o
   financeiro e o estoque enxergam tudo numa fonte só.
4. **Operável sem suporte.** A empresa liga/desliga módulo, convida usuário e configura
   integrações pela própria tela.
5. **Integrável.** Webhooks assinados, tempo real, pagamento online por adaptador.

## 5. Escopo funcional

### 5.1 Núcleo (toda empresa)

- **Autenticação**: login por empresa + e-mail, refresh com rotação, esqueci/redefinir senha,
  convite de usuário por e-mail, troca de senha derruba outras sessões.
- **Usuários e perfis (RBAC)**: perfis genéricos por empresa, matriz perfil × permissão com
  catálogo vindo do código, exceções individuais (ALLOW/DENY), `admin` com acesso total.
- **Clientes**: cadastro, endereços, resumo comercial (compras, ticket médio, em aberto).
- **Produtos e estoque central**: produto → variantes (SKU/código de barras), categorias,
  armazéns, razão imutável, reserva/consumo/entrada/ajuste/transferência, mínimo com alerta,
  inventário físico com aplicação segura.
- **Compras**: fornecedores, pedido de compra, recebimento parcial, custo médio ponderado, título
  a pagar automático, devolução ao fornecedor, sugestão de reposição.
- **Financeiro básico**: títulos a receber/pagar, baixas por meio de pagamento, contas e
  categorias, fluxo de caixa do período, vencidos.
- **Pedido genérico**: cabeçalho e itens universais, status universal, pagamentos, histórico,
  itens em pedido aberto, cancelamento com estorno de estoque; o módulo decide o resto.
- **Pagamento online**: intenção (QR/link) por provedor plugável; webhook confirma e conclui.
- **Integrações**: webhooks por empresa (HMAC, retry), eventos duráveis, Socket.IO por empresa.
- **Notificações**: sino in-app com leitura por pessoa; CSV em qualquer listagem; auditoria.
- **Plataforma**: onboarding de empresa por API, status, módulos, catálogo de módulos.

### 5.2 Módulo Varejo

PDV com bipagem e múltiplos meios; caixa (abertura, sangria/suprimento, fechamento com
conferência); grade tamanho×cor gerando variantes; etiquetas em ZPL e PDF com Code128;
vendedores, regras de comissão com vigência, aprovação e pagamento; devolução/troca com vale;
relatórios (vendedor, hora, curva ABC, sem giro).

### 5.3 Módulo Food & Delivery

Mesas e comandas (abrir, rodadas, transferir, conta com taxa de serviço, fechar); fluxo de
cozinha por estação (QUEUED → PREPARING → READY → SERVED) em tempo real; ficha técnica com baixa
de insumos e CMV; cardápio online publicável com adicionais; pedido público do cliente final
(retirada/entrega, pagamento na entrega ou PIX online) e acompanhamento; entregadores, zonas por
CEP, acerto do entregador; relatórios.

### 5.4 Módulo Academia

Planos com ciclo e fidelidade; adesão pelo pedido (matrícula nasce ao pagar); cobrança
recorrente por job e inadimplência automática; pausar/retomar/trocar plano; check-in de recepção
e catraca por webhook com credenciais (cartão, QR, PIN, biometria) e regras do plano; turmas,
sessões, reservas e chamada; painel (MRR, churn), frequência, pico, alunos sumidos.

### 5.5 Módulo Serviços / Automotivo

Veículos por placa (antiga e Mercosul) com histórico; OS como pedido (peças reservam estoque,
consumo na entrega); orçamento com aprovação e recusa parcial; status de manutenção fino
projetado no status do pedido; técnico, checklist de entrada/saída, anexos; agenda com
capacidade de boxes e chegada que abre a OS; catálogo de serviços; relatórios.

## 6. Requisitos não funcionais

| Requisito | Alvo | Como se garante |
|---|---|---|
| Isolamento entre empresas | Nenhuma leitura/escrita cruzada, mesmo com bug | `tenant_id` em tudo, FK composta, extensão Prisma, RLS estrito com dois papéis; teste e2e prova direto no banco |
| Disponibilidade | Readiness com ping no banco; jobs desligáveis por instância | `/health/ready`, `JOBS_ENABLED` |
| Segurança | Senhas bcrypt, JWT curto + refresh rotativo, segredos cifrados, rate limit em login/público, credencial nunca em argumento | `shared/crypto.ts`, `RULES.md` |
| Auditabilidade | Quem fez o quê | `core_audit_logs`, histórico de status, eventos duráveis |
| Performance | Leitura de permissões 1 ida ao banco por request; cache de módulos 15 s | `rbac.service.ts`, `tenant-modules.service.ts` |
| Precisão monetária | Sem float | `Decimal(14,2)` e `shared/money.ts` |
| Operação | Um comando sobe tudo | `docker compose`, CI completo |

## 7. Métricas de sucesso

- Uma empresa nova operando (login, produto, venda) em menos de 10 minutos pela API de plataforma.
- Zero vazamento entre empresas nos testes de isolamento (gate de CI).
- Todo fluxo de venda de cada módulo coberto por teste ponta a ponta.
- Módulo novo adicionado sem alteração em tabela do núcleo.

## 8. Fora de escopo (por ora)

Emissão fiscal (NFC-e/NF-e/SAT), folha de pagamento, contabilidade, BI avançado, app mobile
nativo, marketplace de módulos de terceiros, multi-moeda, multi-idioma.

## 9. Estado atual

Ver `TASKS.md` (feito × pendente) e `MEMORY.md` (decisões e lições). Números do último corte:
250 rotas documentadas em `docs/API.md`, 84 tabelas com RLS, 17 testes unitários, 18 e2e de API,
4 e2e de navegador.
