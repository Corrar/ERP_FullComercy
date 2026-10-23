# Operação — FullComercy

Procedimentos de quem opera o SaaS: trocar a chave de cifra e guardar/restaurar o banco. Os passos
no Render, no Neon e no terminal são do responsável. O executor (a sessão de IA) não lê connection
string nem segredo de produção (CLAUDE.md): ele confere o estado só pelas rotas `/platform/*`, com a
chave de plataforma, ou por um bloco que o responsável roda e cola.

---

## 1. Rotação da `APP_ENCRYPTION_KEY`

**O que a chave protege:** segredos que a API precisa ler de volta e que por isso ficam cifrados
no banco (AES-256-GCM, `shared/crypto.ts`):

| Onde | Campo |
|---|---|
| Webhooks da empresa | `core_webhooks.secret` (assina o `X-FC-Signature`) |
| Catracas e portas da academia | `gym_access_devices.config.webhookToken` |

Senha, refresh token e credencial da catraca **não** dependem dela: são hash, não cifra.

Cada selo leva o id da chave que o fechou (`gcm:<kid>:…`). Selos de antes da rotação existir não
têm kid; a API os abre por tentativa, e o job os regrava no formato novo.

**Quando trocar:**
- se a chave vazou, ou pode ter vazado (print, log, alguém que saiu do time);
- além disso, uma vez por ano.

**Passo a passo:**

1. Gere a chave nova, com 32 bytes aleatórios: `openssl rand -base64 32`.
2. No serviço `erp-modular-api` do Render:
   - copie o valor atual de `APP_ENCRYPTION_KEY` para uma variável nova, `APP_ENCRYPTION_KEY_PREVIOUS`;
   - ponha a chave nova em `APP_ENCRYPTION_KEY`;
   - salve e faça o deploy.

   A anterior só abre, nunca fecha. A API não sobe se a anterior for igual à atual, ou se houver
   anterior sem atual.
3. O job `core.recifrar-segredos` roda logo após o boot e depois a cada hora. Ele regrava cada segredo
   na chave nova. Para não esperar o job, rode já:
   `POST /platform/segredos/recifrar` com o header `x-platform-key`.
4. Confira com `GET /platform/segredos`. A resposta tem de mostrar `pendentes: 0` e `ilegiveis: 0`,
   com todo o `porChave` na `chaveAtual`.
5. Só então apague `APP_ENCRYPTION_KEY_PREVIOUS` do Render e faça o deploy de novo.

**Se algo der errado:**
- **Você tirou a anterior cedo demais.** Nada se perde, desde que o valor antigo ainda exista em algum
  lugar: volte com ele em `APP_ENCRYPTION_KEY_PREVIOUS`. Enquanto isso:
  - o webhook daquela empresa falha a entrega e o motivo fica gravado: "segredo do webhook ilegível";
  - a catraca responde 401;
  - todo o resto segue normal.
- **A chave antiga se perdeu de vez.** Os segredos selados com ela não voltam. Cada empresa gera
  segredos novos: recrie o webhook e use "novo token" no dispositivo. `ilegiveis` no status diz quantos
  são.

---

## 2. Backup e restauração do banco (Neon)

**A política:**

| O quê | Como | Quem |
|---|---|---|
| Recuperar de um erro recente (migration ruim, `DELETE` errado) | Restauração por ponto no tempo do Neon (branch restore) | responsável, no console do Neon |
| Cópia fora do Neon | `pg_dump` semanal, guardado fora da conta do Neon (outro provedor) | responsável |
| Antes de migration que apaga ou reescreve dado | Branch do Neon criada na hora, como ponto de volta | quem aplica a migration |
| Prova de que o backup serve | Ensaio de restauração a cada 3 meses, numa branch, com a suíte e2e contra ela | responsável |

**Antes de contar com a restauração por ponto no tempo:**
- O alcance dela é a janela de histórico do plano do Neon. Confira o valor no console, nas
  configurações do projeto.
- Se a janela for menor que o tempo que um erro leva para ser notado, o `pg_dump` semanal é o que
  cobre o resto.

**Como restaurar, por ponto no tempo:**
1. No console do Neon, crie uma branch a partir do instante anterior ao erro.
2. Confira os dados nessa branch. Dois jeitos:
   - pela API apontada para ela, num serviço de teste;
   - por um bloco SQL que o responsável roda.
3. Promova a branch, ou copie de volta só as linhas perdidas.
4. Troque `DATABASE_URL` no Render só se a branch nova virar a principal.

**Cuidados no `pg_dump`:**
- Use o `pg_dump` da mesma versão maior do Postgres do Neon.
- Use a conexão direta, não a do pooler.
- Passe a senha por `PGPASSFILE` ou por variável de ambiente, nunca na linha de comando (CLAUDE.md,
  regra 3).

**A cópia leva os segredos cifrados junto.** Guarde a `APP_ENCRYPTION_KEY` (e a anterior, durante
uma rotação) num lugar separado do backup:
- a cópia sem a chave não abre os webhooks nem as catracas;
- a chave junto da cópia anula a cifra.

---

## 3. Pix com baixa automática (Mercado Pago da empresa)

Cada empresa recebe na conta do Mercado Pago **dela**. A plataforma não intermedeia o dinheiro.

**No servidor (uma vez):**
- `API_PUBLIC_URL` no Render. É o endereço https público da API, e o Mercado Pago avisa o pagamento
  em `<API_PUBLIC_URL>/public/payments/mercadopago/webhook`.
  - Homologação: use `https://erp-modular-api.onrender.com`. A Vercel exige login do time e barraria
    o aviso.
  - Produção: sem `API_PUBLIC_URL` com https, a API não sobe (`configProblems`).

**Na empresa (pela tela "Cobranças online"):**
1. No Mercado Pago, abra **Suas integrações → (aplicação) → Credenciais de produção** e copie o
   Access Token (`APP_USR-…`).
2. Cole o token em "Conectar Mercado Pago". A API confere o token lá (`/users/me`); se o Mercado
   Pago recusar, nada é gravado. O token fica **selado** com a `APP_ENCRYPTION_KEY`, entra na rotação
   do §1 e não volta à tela.
3. Opcional, como reforço: em **Webhooks** da mesma aplicação, ative "Pagamentos" e copie a
   assinatura secreta para o campo "Assinatura secreta dos avisos". Com ela, aviso sem assinatura
   válida é recusado (401).

**Como a baixa acontece:**
- Com a conta conectada, "Cobrar por Pix" (pedido) e "Pagar agora" (cardápio online) geram o Pix pelo
  Mercado Pago.
- O aviso traz só o id do pagamento. A API **relê** o pagamento na API do Mercado Pago com o token
  da empresa. Só `approved` baixa o pedido, e só uma vez.
- Sem conta conectada, vale a chave Pix: o operador confirma o recebimento à mão.

**Problemas:**
- **Pix pago e pedido sem baixa.** Confira `API_PUBLIC_URL`. Depois veja o log do Render em
  `/public/payments/mercadopago/webhook`:
  - 401: assinatura secreta diferente da do painel;
  - 404: o aviso chegou antes de a cobrança ser gravada, e o Mercado Pago reenvia sozinho.
- **Empresa trocou o token no Mercado Pago.** "Desconectar" e conectar de novo.
  - As cobranças pendentes da conta anterior já não podem ser conferidas lá; o aviso delas é
    recusado (401).
  - Enquanto não houver conta conectada, a lista mostra "Confirmar à mão" para essas cobranças. Use
    só depois de ver o dinheiro na conta.
