// src/core/payments/Cobrancas.tsx — a tela da função "Cobrança online": a chave Pix da empresa
// (sem ela não há o que cobrar) e as cobranças geradas, com o link de cada uma e a confirmação do
// recebimento. Cobrar mesmo é no pedido ("Cobrar por Pix"), onde está o valor.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post, put } from '@/lib/api';
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

  return <div className="grid">
    <h1>Cobranças online</h1>
    {cfg.data && <Card title="Pix da empresa">
      <div className="muted" style={{ marginBottom: 10 }}>Com a chave cadastrada, cada pedido ganha o botão <strong>Cobrar por Pix</strong>: QR Code e copia e cola já com o valor, e um link para mandar ao cliente. O dinheiro cai direto na conta da chave.</div>
      {!cfg.data.chave && <div className="banner warn" style={{ margin: '0 0 12px' }}>Cadastre a chave para começar a cobrar por Pix.</div>}
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
        { h: 'Meio', c: (r) => r.method },
        { h: 'Valor', c: (r) => <Money v={r.amount} />, right: true },
        { h: 'Situação', c: (r) => <Badge s={r.status} /> },
        { h: '', c: (r) => r.status === 'PENDING' && <div className="row" style={{ justifyContent: 'flex-end' }}>
          {r.checkoutUrl && <Copiar texto={r.checkoutUrl} rotulo="Link" />}
          {r.provider === 'manual' && <button className="btn primary" onClick={() => void confirmar.run(r.id)} disabled={confirmar.busy}>Confirmar recebimento</button>}
          <button className="btn danger" onClick={() => void cancelar.run(r.id)} disabled={cancelar.busy}>Cancelar</button>
        </div> },
      ]} />
    </Card>
    <Toast msg={msg} />
  </div>;
}
