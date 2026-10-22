// src/store/MyAccount.tsx — a área da CONTA: as empresas que ela abre (com o estado da assinatura)
// e o atalho para montar mais um ERP. "Abrir" troca o token da conta por uma sessão da empresa.
// Por empresa: plano, próxima cobrança e faturas (só de quem paga) e reenviar os dados de acesso.
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Avatar, ErrorBox, Modal, Spinner, Table, Toast } from '@/components/ui';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';
import { acct } from '@/lib/api';
import { accountSession, useAccount } from '@/lib/account';
import { session } from '@/lib/session';
import { useAction } from '@/lib/use-api';
import { useEffect, useState } from 'react';
import { BRAND_LABEL, daysLeft, INVOICE_STATUS, METHOD_LABEL, SUB_STATUS } from '@/lib/billing';
import { brl, d } from '@/lib/format';
import { StoreLayout } from './shared';

export function MyAccount() {
  const account = useAccount();
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (account) acct.get('/account/me').then((r) => { setMe(r); accountSession.patch(r.account); }, (e) => setError(e.message)); }, [account?.token]);
  const open = useAction(async (id: string) => { session.set(await acct.post(`/account/companies/${id}/session`)); nav('/', { replace: true }); });
  const [detalhe, setDetalhe] = useState<{ co: any; a: any } | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const ver = useAction(async (co: any) => setDetalhe({ co, a: await acct.get(`/account/companies/${co.id}/assinatura`) }));
  const reenviar = useAction(async (co: any) => { const r = await acct.post(`/account/companies/${co.id}/reenviar-acesso`); setMsg(`Dados de acesso de ${co.name} enviados para ${r.enviadoPara}.`); });
  if (!account) return <Navigate to="/login?next=/minha-conta" replace />;

  return (
    <StoreLayout>
      <div className="row between" style={{ marginBottom: 22 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
          <Avatar name={account.account.name} src={account.account.avatarUrl} />
          <div><h1 style={{ margin: 0 }}>Olá, {account.account.name.split(' ')[0]}</h1><div className="muted small">{account.account.email}</div></div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => nav('/comecar')}><Icon name="plus" size={16} /> Montar novo ERP</button>
          <button className="btn" onClick={() => { accountSession.clear(); nav('/comecar'); }}><Icon name="logout" size={16} /> Sair da conta</button>
        </div>
      </div>
      <ErrorBox error={error ?? open.error ?? ver.error ?? reenviar.error} />
      <h2>Minhas empresas</h2>
      {!me ? <div className="skel" style={{ height: 120 }} /> : !me.companies.length ? (
        <div className="card empty stack" style={{ justifyItems: 'center' }}>
          <Icon name="building" size={32} />
          <div>Você ainda não tem um ERP. Monte o seu em poucos minutos{me.account.trialAvailable ? ' — os primeiros 7 dias são grátis' : ''}.</div>
          <button className="btn primary" onClick={() => nav('/comecar')}>Começar</button>
        </div>
      ) : (
        <div className="mod-grid">
          {me.companies.map((co: any) => {
            const m = co.modules[0] ?? null;
            const stt = co.subscription ? SUB_STATUS[co.subscription.status] : null;
            return (
              <div key={co.id} className="mod-card" style={{ ...accentStyle(m), cursor: 'default' }}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <span className="mod-icon"><Icon name={m ? MODULE_LOOK[m as keyof typeof MODULE_LOOK].icon : 'building'} size={24} /></span>
                  {stt && <span className={`badge ${stt.tone}`}>{stt.label}</span>}
                </div>
                <div><div className="t">{co.name}</div><div className="s">{co.slug}</div></div>
                {co.subscription && <div className="muted small">{brl(co.subscription.amount)}/mês{co.subscription.status === 'TRIALING' ? ` · teste termina em ${daysLeft(co.subscription.trialEndsAt)} dia(s)` : ''}</div>}
                <div className="stack" style={{ marginTop: 'auto', gap: 8 }}>
                  {co.subscription && <button className="btn block" onClick={() => void ver.run(co)} disabled={ver.busy}><Icon name="receipt" size={16} /> Assinatura e faturas</button>}
                  <button className="btn block" onClick={() => void reenviar.run(co)} disabled={reenviar.busy}><Icon name="mail" size={16} /> Reenviar dados de acesso</button>
                </div>
                <button className="btn primary block" disabled={open.busy} onClick={() => void open.run(co.id)}>{open.busy ? <Spinner /> : null} Abrir ERP <Icon name="arrowRight" size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
      <Modal title={detalhe ? `Assinatura · ${detalhe.co.name}` : ''} open={!!detalhe} onClose={() => setDetalhe(null)} wide>{detalhe?.a && <Assinatura a={detalhe.a} />}</Modal>
      <Toast msg={msg} />
    </StoreLayout>
  );
}

function Assinatura({ a }: { a: any }) {
  const stt = SUB_STATUS[a.status];
  const proxima = a.status === 'TRIALING' ? `Teste grátis até ${d(a.trialEndsAt)}; a primeira cobrança é nesse dia.` : a.cancelAtPeriodEnd ? `Cancelada: acesso até ${d(a.currentPeriodEnd)}.` : `Próxima cobrança em ${d(a.currentPeriodEnd)}.`;
  return <div className="stack" style={{ gap: 14 }}>
    <div className="row between"><div><div className="total mono" style={{ fontSize: 26, fontWeight: 800 }}>{brl(a.amount)}<small className="muted" style={{ fontSize: 13 }}> /mês</small></div><div className="muted small">{proxima}</div></div>{stt && <span className={`badge ${stt.tone}`}>{stt.label}</span>}</div>
    <div className="muted small">Pagamento: {METHOD_LABEL[a.method as keyof typeof METHOD_LABEL] ?? a.method}{a.pagamento?.last4 ? ` · ${BRAND_LABEL[a.pagamento.brand] ?? 'Cartão'} final ${a.pagamento.last4}` : ''}. Para trocar o cartão, mudar funções ou cancelar, abra o ERP e vá em Assinatura.</div>
    <div><strong>O que está contratado</strong>{a.items.map((i: any) => <div key={i.label} className="row between" style={{ padding: '4px 0' }}><span>{i.label}</span><span className="mono">{brl(i.price)}</span></div>)}</div>
    <div><strong>Faturas</strong><Table<any> rows={a.faturas} empty={a.status === 'TRIALING' ? 'Nenhuma fatura ainda: a primeira sai no fim do teste grátis.' : 'Nenhuma fatura.'} cols={[
      { h: 'Período', c: (f) => `${d(f.periodStart)} a ${d(f.periodEnd)}` }, { h: 'Vencimento', c: (f) => d(f.dueAt) }, { h: 'Valor', c: (f) => brl(f.amount), right: true },
      { h: 'Situação', c: (f) => <span className={`badge ${INVOICE_STATUS[f.status]?.tone ?? ''}`}>{INVOICE_STATUS[f.status]?.label ?? f.status}</span> },
    ]} /></div>
  </div>;
}
