# DESIGN — FullComercy

> Como o produto se apresenta: princípios de UX, sistema visual do front, padrões de tela e
> convenções de API (a "interface" que integradores veem).

## 1. Princípios

1. **Rápido no balcão.** PDV, KDS, recepção e kanban de OS são telas de operação: foco no campo
   certo, Enter faz a ação principal, números grandes, nada que exija mouse para o fluxo comum.
2. **Mostra só o que a empresa tem.** Menu e rotas nascem dos módulos ativos e das permissões;
   nenhuma tela "em breve" ou botão cinza para o que não se pode fazer.
3. **O erro da API é a mensagem.** `AppError` traz texto legível em português e `details` de
   validação por campo; a tela exibe isso, não "algo deu errado".
4. **Tempo real onde muda sozinho.** Cozinha, entregas, catraca, sino. O resto recarrega por ação.
5. **Dinheiro e data no formato do Brasil.** `R$ 1.234,56`, `dd/mm/aaaa`, `;` e vírgula no CSV.

## 2. Sistema visual (apps/web/src/styles.css)

Tokens em `:root`, um arquivo, sem framework:

| Token | Valor | Uso |
|---|---|---|
| `--bg` / `--surface` | `#f6f7fb` / `#fff` | fundo da página / cartões |
| `--text` / `--muted` | `#0f172a` / `#64748b` | texto / secundário |
| `--primary` | `#2563eb` | ação principal, links, mesa reservada |
| `--ok` / `--warn` / `--danger` | `#16a34a` / `#d97706` / `#dc2626` | status |
| `--sidebar` | `#0f172a` | barra lateral escura |
| `--radius` / `--shadow` | `10px` / suave | cartões, modais |

Tipografia: `system-ui`, 14px base, títulos 20/16. Grid de KPIs `auto-fill minmax(200px)`.
Responsivo: abaixo de 900px a sidebar vira topo e o PDV empilha. Trocar o visual é trocar
este arquivo e `components/ui.tsx`.

## 3. Primitivas (components/ui.tsx)

`Card` (título + ações), `Kpi` (rótulo + valor, opcionalmente em R$), `Badge` (status com cor
por semântica), `Money`, `Table` (colunas declarativas, clique na linha, vazio amigável),
`Modal` (Esc fecha), `Form` (coleta campos nomeados; `number` vira número; `checkbox` vira
booleano), `Field`, `Tabs`, `Toast`, `ErrorBox`, `Empty`.

Padrão de tela de cadastro: título + busca + botão primário à direita; tabela; modal de criação;
clique na linha abre detalhe; detalhe tem formulário de edição à esquerda e blocos relacionados à
direita.

## 4. Padrões por módulo

- **PDV**: duas colunas (itens | total/pagamento); campo de bipagem com foco permanente;
  pagamento acumulável com troco/falta visível; botão largo de finalizar; toast com nº da venda.
- **Salão**: grade de mesas com cor por status (`FREE` branco, `OCCUPIED` âmbar, `RESERVED`
  azul, `CLOSING` vermelho); modal da mesa concentra comanda, rodada e conta.
- **KDS**: cartões por ticket com borda colorida por status, itens em lista grande, um botão
  por transição; filtro por estação com tempo médio.
- **Kanban de OS**: colunas por status de manutenção, cartão com placa em destaque, total e técnico.
- **Vitrine pública**: fora do shell, largura 960, cartões por item, carrinho fixo no topo,
  checkout em modal, acompanhamento com passos.

## 5. Acessibilidade e qualidade

Botões são `<button>`, formulários são `<form>` (Enter envia), campos com `<label>`; contraste
AA nos tokens; foco visível do navegador preservado; estados vazios com texto; erros ao lado da
ação. Pendente: navegação completa por teclado no KDS e leitura de status por leitor de tela
(ver `TASKS.md`).

## 6. Convenções da API (a interface dos integradores)

- **Forma**: REST em JSON; recursos no plural em inglês no núcleo (`/orders`, `/customers`) e
  em português nos módulos (`/m/varejo/caixa`, `/m/food/comandas`), porque é o vocabulário do
  nicho brasileiro.
- **Erro**: `{ error, code, details? }` com códigos estáveis: `VALIDATION` 400,
  `UNAUTHENTICATED` 401, `FORBIDDEN`/`MODULE_INACTIVE` 403, `NOT_FOUND` 404, `CONFLICT` 409,
  `MODULE_AMBIGUOUS`/`STOCK_INSUFFICIENT`/`INVALID_TRANSITION` 422.
- **Listagem**: `?q=` busca, filtros nomeados, `page`/`pageSize` onde há volume, `?format=csv` em
  qualquer lista. Toda resposta carrega `X-Request-Id`.
- **Idempotência**: `X-Idempotency-Key` em movimentos de estoque e criação de pedido.
- **Datas** ISO 8601; **dinheiro** como string decimal (`"179.8"`), nunca número binário.
- **Webhooks**: POST JSON `{ id, type, occurredAt, tenantId, data }`, `X-FC-Signature:
  sha256=<HMAC>`, `X-FC-Event`, `X-FC-Event-Id`; 2xx confirma, resto reentrega com backoff.
- **Tempo real**: Socket.IO com `auth.token` = access token; sala por empresa; eventos com o
  mesmo nome do barramento.
