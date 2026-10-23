// src/core/payments/Cobrancas.tsx — a tela da função "Cobrança online": por onde a empresa recebe
// (conta do Mercado Pago, com baixa automática, ou a chave Pix, com confirmação à mão) e as
// cobranças geradas, com o link de cada uma. Cobrar mesmo é no pedido ("Cobrar por Pix").
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { del, post, put } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { Badge, Card, ErrorBox, Field, Form, Money, Table, Toast } from '@/components/ui';
import { dt } from '@/lib/format';
import { Copiar } from './CobrarPix';

export function Cobrancas() {
  const cfg = useGet<{ chave: string | null; nome: string | null; cidade: string | null }>('/payments/config/pix');
  const lista = useGet<any[]>('/payments/intents');
  const empresa = useGet<any>('/tenant/marca');
  const [msg, setMsg] = useState<string | null>(null);
  const salvar = useAction(async (v: Record<string, any>) => { await put('/payments/config/pix', { chave: v.chave, nome: v.nome, cidade: v.cidade }); await cfg.reload(); setMsg('Chave Pix salva.'); });
  const confirmar = useAction(async (id: string) => { await post(`/payments/intents/${id}/confirm`); await lista.reload(); setMsg('Recebimento confirmado: o pagamento entrou no pedido.'); });
  const cancelar = useAction(async (id: string) => { await post(`/payments/intents/${id}/cancel`); await lista.reload(); });
  const mp = useGet<{ conectado: boolean; conta: { apelido: string | null; email: string | null; teste: boolean } | null; assinaturaDoAviso: boolean; emUso: string | null }>('/payments/config/mercadopago');
  const conectar = useAction(async (v: Record<string, any>) => { await put('/payments/config/mercadopago', { accessToken: v.accessToken, webhookSecret: v.webhookSecret }); await mp.reload(); setMsg('Mercado Pago conectado: os Pix agora dão baixa sozinhos.'); });
  const desconectar = useAction(async () => { await del('/payments/config/mercadopago'); await mp.reload(); setMsg('Mercado Pago desconectado.'); });

  return <div className="grid">
    <h1>Cobranças online</h1>
    {mp.data && <Card title="Mercado Pago — baixa automática">
      <div className="muted" style={{ marginBottom: 10 }}>Conectando a conta do Mercado Pago da empresa, o Pix de cada cobrança é gerado por ela e, quando o cliente paga, <strong>o pedido é baixado sozinho</strong> — sem conferir extrato. O dinheiro cai na conta do Mercado Pago da empresa.</div>
      <ErrorBox error={conectar.error ?? desconectar.error} />
      {mp.data.conectado ? <div className="row between" data-testid="mp-conectado">
        <div>Conectado como <strong>{mp.data.conta?.apelido ?? mp.data.conta?.email ?? 'conta do Mercado Pago'}</strong>{mp.data.conta?.teste && <> <span className="badge warn">modo de teste</span></>}
          <div className="faint small">{mp.data.assinaturaDoAviso ? 'Avisos conferidos pela assinatura secreta.' : 'Sem assinatura secreta: cada aviso é conferido relendo o pagamento no Mercado Pago.'}</div></div>
        <button className="btn danger" onClick={() => void desconectar.run()} disabled={desconectar.busy}>Desconectar</button>
      </div> : <Form onSubmit={(v) => void conectar.run(v)} busy={conectar.busy} submitLabel="Conectar Mercado Pago">
        <Field label="Access Token de produção (Mercado Pago → Suas integrações → Credenciais de produção)"><input className="input" name="accessToken" required autoComplete="off" placeholder="APP_USR-…" /></Field>
        <Field label="Assinatura secreta dos avisos (opcional — Suas integrações → Webhooks)"><input className="input" name="webhookSecret" autoComplete="off" /></Field>
        <div className="faint small">O token é conferido no Mercado Pago e guardado cifrado; ninguém o vê de novo pela tela.</div>
      </Form>}
    </Card>}
    {cfg.data && <Card title={mp.data?.conectado ? 'Pix pela chave (reserva)' : 'Pix da empresa'}>
      <div className="muted" style={{ marginBottom: 10 }}>Com a chave cadastrada, cada pedido ganha o botão <strong>Cobrar por Pix</strong>: QR Code e copia e cola já com o valor, e um link para mandar ao cliente. O dinheiro cai direto na conta da chave.</div>
      {!cfg.data.chave && !mp.data?.conectado && <div className="banner warn" style={{ margin: '0 0 12px' }}>Conecte o Mercado Pago ou cadastre a chave para começar a cobrar por Pix.</div>}
      {mp.data?.conectado && <div className="faint small" style={{ marginBottom: 8 }}>Com o Mercado Pago conectado, as cobranças novas saem por ele; a chave só é usada se você desconectar.</div>}
      <ErrorBox error={salvar.error} />
      <Form key={cfg.data.chave ?? 'nova'} onSubmit={(v) => void salvar.run(v)} busy={salvar.busy} submitLabel="Salvar chave">
        <Field label="Chave Pix (CPF, CNPJ, e-mail, celular com +55 ou chave aleatória)"><input className="input" name="chave" required defaultValue={cfg.data.chave ?? ''} placeholder="+5511999998888 ou contato@minhaloja.com.br" /></Field>
        <div className="row">
          <Field label="Nome do recebedor (como no banco)"><input className="input" name="nome" required maxLength={60} defaultValue={cfg.data.nome ?? empresa.data?.nome ?? ''} /></Field>
          <Field label="Cidade"><input className="input" name="cidade" required maxLength={40} defaultValue={cfg.data.cidade ?? ''} placeholder="São Paulo" /></Field>
        </div>
      </Form>
    </Card>}
    <Card title="Cobranças geradas">
      <ErrorBox error={lista.error ?? confirmar.error ?? cancelar.error} />
      <Table rows={lista.data} empty="Nenhuma cobrança ainda. Abra um pedido com valor a receber e use Cobrar por Pix." cols={[
        { h: 'Quando', c: (r) => dt(r.createdAt) },
        { h: 'Pedido', c: (r) => (r.orderId ? <Link to={`/pedidos/${r.orderId}`}>abrir</Link> : '—') },
        { h: 'Meio', c: (r) => `${r.method}${r.provider === 'mercadopago' ? ' · Mercado Pago' : ''}` },
        { h: 'Valor', c: (r) => <Money v={r.amount} />, right: true },
        { h: 'Situação', c: (r) => <Badge s={r.status} /> },
        { h: '', c: (r) => r.status === 'PENDING' && <div className="row" style={{ justifyContent: 'flex-end' }}>
          {r.checkoutUrl && <Copiar texto={r.checkoutUrl} rotulo="Link" />}
          {r.provider === 'manual' && <button className="btn primary" onClick={() => void confirmar.run(r.id)} disabled={confirmar.busy}>Confirmar recebimento</button>}
          {/* Reserva: cobrança de uma conta do Mercado Pago que já foi desconectada não tem mais quem a confira. */}
          {r.provider !== 'manual' && !mp.data?.conectado && <button className="btn" title="Só depois de ver o dinheiro na conta" onClick={() => void confirmar.run(r.id)} disabled={confirmar.busy}>Confirmar à mão</button>}
          <button className="btn danger" onClick={() => void cancelar.run(r.id)} disabled={cancelar.busy}>Cancelar</button>
        </div> },
      ]} />
    </Card>
    <Toast msg={msg} />
  </div>;
}
