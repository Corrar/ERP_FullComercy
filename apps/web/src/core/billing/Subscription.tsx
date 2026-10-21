// src/core/billing/Subscription.tsx — a ASSINATURA vista de dentro do ERP: plano e valor, teste
// grátis, trocar funções (o mesmo configurador da loja), forma de pagamento, faturas e
// cancelamento. Fica aberta mesmo com a empresa suspensa — é por aqui que se regulariza.
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { Card, ErrorBox, Modal, Spinner, Table, Toast } from '@/components/ui';
import { FeatureList, ModuleBadge, PaymentForm, CopyBox, EMPTY_CARD } from '@/store/shared';
import { api, put, post } from '@/lib/api';
import { useAction, useGet } from '@/lib/use-api';
import { useSession, type ModuleKey } from '@/lib/session';
import { BRAND_LABEL, daysLeft, INVOICE_STATUS, METHOD_LABEL, SUB_STATUS, tokenizeCard, useCatalog, useQuote, type BillingMethod } from '@/lib/billing';
import { brl, d } from '@/lib/format';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';

export function Subscription() {
  const { data: sub, error, reload, setData } = useGet<any>('/billing/subscription');
  const { data: catalog } = useCatalog();
  const { refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cancel = useAction(async () => { if (!confirm('Cancelar a assinatura? O acesso continua até o fim do período atual.')) return; setData(await post('/billing/subscription/cancel')); setToast('Cancelamento agendado.'); });
  const reactivate = useAction(async () => { setData(await post('/billing/subscription/reactivate')); await refresh(); setToast('Assinatura reativada.'); });
  const payNow = useAction(async (id: string) => { const r = await post(`/billing/invoices/${id}/pay`); await reload(); await refresh().catch(() => undefined); setToast(r.status === 'PAID' ? 'Pagamento confirmado.' : r.status === 'FAILED' ? `Recusado: ${r.failureReason}` : 'Cobrança gerada.'); });

  if (error) return <ErrorBox error={error} />;
  if (!sub || !catalog) return <div className="stack"><div className="skel" style={{ height: 120 }} /><div className="skel" style={{ height: 240 }} /></div>;
  const stt = SUB_STATUS[sub.status];
  const pi = sub.paymentInfo ?? {};
  const open = sub.invoices.filter((i: any) => i.status === 'OPEN' || i.status === 'FAILED');

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Toast msg={toast} />
      <div className="row between"><h1 style={{ margin: 0 }}>Assinatura</h1><span className={`badge ${stt.tone}`}>{stt.label}</span></div>
      <ErrorBox error={cancel.error ?? reactivate.error ?? payNow.error} />

      <div className="grid kpis">
        <div className="card kpi"><div className="label">Mensalidade</div><div className="value mono">{brl(sub.amount)}</div></div>
        <div className="card kpi"><div className="label">{sub.status === 'TRIALING' ? 'Teste grátis até' : sub.cancelAtPeriodEnd ? 'Acesso até' : 'Próxima cobrança'}</div><div className="value">{d(sub.currentPeriodEnd)}</div>{sub.status === 'TRIALING' && <div className="muted small">{daysLeft(sub.trialEndsAt)} dia(s) restantes</div>}</div>
        <div className="card kpi"><div className="label">Pagamento</div><div className="value" style={{ fontSize: 18 }}>{METHOD_LABEL[sub.method as BillingMethod]}</div><div className="muted small">{sub.method === 'CARD' && pi.last4 ? `${BRAND_LABEL[pi.brand] ?? pi.brand} final ${pi.last4}` : sub.method === 'PIX_AUTO' ? (pi.pixStatus === 'AUTHORIZED' ? 'Autorizado no banco' : 'Aguardando autorização') : 'Boleto mensal'}</div></div>
      </div>

      {sub.method === 'PIX_AUTO' && pi.pixStatus === 'PENDING' && pi.pixAuthorizationQr && <Card title="Autorize o Pix Automático"><CopyBox label="Leia ou cole no app do seu banco para autorizar o débito mensal" value={pi.pixAuthorizationQr} /></Card>}

      <Card title="Seu plano" actions={<button className="btn soft" onClick={() => setEditing(true)}><Icon name="sliders" size={15} /> Alterar funções</button>}>
        <div className="row" style={{ gap: 6, marginBottom: 10 }}>{sub.modules.map((m: ModuleKey) => <ModuleBadge key={m} m={m} catalog={catalog} />)}</div>
        {sub.items.map((i: any) => <div key={i.key} className="line"><span>{i.label}</span><span className="mono">{brl(i.price)}</span></div>)}
      </Card>

      <Card title="Faturas" actions={<button className="btn" onClick={() => setPaying(true)}><Icon name="card" size={15} /> Trocar forma de pagamento</button>}>
        <Table rows={sub.invoices} empty={sub.status === 'TRIALING' ? 'Nenhuma fatura ainda: a primeira sai no fim do teste grátis.' : 'Nenhuma fatura.'} cols={[
          { h: 'Período', c: (i: any) => `${d(i.periodStart)} – ${d(i.periodEnd)}` },
          { h: 'Vencimento', c: (i: any) => d(i.dueAt) },
          { h: 'Forma', c: (i: any) => METHOD_LABEL[i.method as BillingMethod] },
          { h: 'Valor', right: true, c: (i: any) => <span className="mono">{brl(i.amount)}</span> },
          { h: 'Situação', c: (i: any) => <span className={`badge ${INVOICE_STATUS[i.status].tone}`} title={i.failureReason ?? undefined}>{INVOICE_STATUS[i.status].label}</span> },
          { h: '', c: (i: any) => i.status === 'PAID' ? null : <div className="row" style={{ flexWrap: 'nowrap' }}>
            {i.boletoUrl && <a className="btn" href={i.boletoUrl} target="_blank" rel="noreferrer"><Icon name="barcode" size={15} /> Boleto</a>}
            {i.pixCode && <button className="btn" onClick={() => void navigator.clipboard?.writeText(i.pixCode).then(() => setToast('Pix copia e cola copiado.'))}><Icon name="copy" size={15} /> Pix</button>}
            <button className="btn primary" disabled={payNow.busy} onClick={() => void payNow.run(i.id)}>{i.method === 'CARD' ? 'Tentar de novo' : 'Gerar de novo'}</button>
          </div> },
        ]} />
        {open.length > 0 && <div className="muted small" style={{ marginTop: 10 }}>Boleto e Pix são confirmados pelo banco automaticamente, em alguns minutos.</div>}
      </Card>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {sub.status === 'CANCELED' || sub.cancelAtPeriodEnd
          ? <button className="btn primary" disabled={reactivate.busy} onClick={() => void reactivate.run()}><Icon name="undo" size={15} /> Reativar assinatura</button>
          : <button className="btn ghost" style={{ color: 'var(--danger)' }} disabled={cancel.busy} onClick={() => void cancel.run()}>Cancelar assinatura</button>}
      </div>

      {editing && <EditPlan sub={sub} onClose={() => setEditing(false)} onSaved={async (s) => { setData(s); setEditing(false); await refresh(); setToast('Plano atualizado. O novo valor vale a partir da próxima cobrança.'); }} />}
      {paying && <ChangePayment provider={catalog.provider} methods={catalog.methods} current={sub.method} onClose={() => setPaying(false)} onSaved={async (s) => { setData(s); setPaying(false); await refresh().catch(() => undefined); setToast('Forma de pagamento atualizada.'); }} />}
    </div>
  );
}

function EditPlan({ sub, onClose, onSaved }: { sub: any; onClose: () => void; onSaved: (s: any) => void }) {
  const { data: catalog } = useCatalog();
  const [sel, setSel] = useState<{ modules: ModuleKey[]; features: string[] }>({ modules: sub.modules, features: sub.items.map((i: any) => i.key) });
  const { quote, error } = useQuote(sel);
  const save = useAction(async () => onSaved(await put('/billing/subscription/features', sel)));
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  if (!catalog) return null;
  const toggleModule = (m: ModuleKey) => setSel((s) => s.modules.includes(m)
    ? { modules: s.modules.filter((x) => x !== m), features: s.features.filter((k) => catalog.features.find((f) => f.key === k)?.module !== m) }
    : { ...s, modules: [...s.modules, m] });
  return (
    <Modal title="Alterar funções do plano" open wide onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>Módulos</div>
          <div className="row">{catalog.modules.map((m) => (
            <button key={m.key} type="button" className={`btn ${sel.modules.includes(m.key) ? 'primary' : ''}`} style={accentStyle(m.key)} onClick={() => toggleModule(m.key)} disabled={sel.modules.length === 1 && sel.modules[0] === m.key}><Icon name={MODULE_LOOK[m.key].icon} size={15} /> {m.name}</button>
          ))}</div>
        </div>
        <ErrorBox error={error ?? save.error} />
        <FeatureList catalog={catalog} modules={sel.modules} quote={quote} selected={sel.features} onToggle={(k) => setSel((s) => ({ ...s, features: s.features.includes(k) ? s.features.filter((x) => x !== k) : [...s.features, k] }))} />
        <div className="card row between" style={{ position: 'sticky', bottom: -22, padding: 14 }}>
          <div><div className="muted small">Novo valor</div><b className="mono" style={{ fontSize: 20 }}>{quote ? brl(quote.total) : '—'}</b><span className="muted small"> /mês (hoje {brl(sub.amount)})</span></div>
          <button className="btn primary" disabled={!quote || save.busy} onClick={() => void save.run()}>{save.busy ? <Spinner /> : <Icon name="check" size={16} />} Salvar plano</button>
        </div>
      </div>
    </Modal>
  );
}

function ChangePayment({ provider, methods, current, onClose, onSaved }: { provider: string; methods: BillingMethod[]; current: BillingMethod; onClose: () => void; onSaved: (s: any) => void }) {
  const [method, setMethod] = useState<BillingMethod>(current);
  const [card, setCard] = useState(EMPTY_CARD);
  const save = useAction(async () => {
    const cardToken = method === 'CARD' ? await tokenizeCard(card, provider) : undefined;
    onSaved(await api('/billing/payment-method', { method: 'PUT', body: { method, cardToken } }));
  });
  return (
    <Modal title="Forma de pagamento" open onClose={onClose}>
      <div className="stack">
        <PaymentForm methods={methods} method={method} setMethod={setMethod} card={card} setCard={setCard} />
        <ErrorBox error={save.error} />
        <button className="btn primary block" disabled={save.busy} onClick={() => void save.run()}>{save.busy ? <Spinner /> : <Icon name="check" size={16} />} Salvar</button>
        <div className="muted small">Se houver mensalidade pendente, ela é cobrada de novo pela forma nova.</div>
      </div>
    </Modal>
  );
}
