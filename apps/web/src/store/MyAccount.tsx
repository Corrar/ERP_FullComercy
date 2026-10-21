// src/store/MyAccount.tsx — a área da CONTA: as empresas que ela abre (com o estado da assinatura)
// e o atalho para montar mais um ERP. "Abrir" troca o token da conta por uma sessão da empresa.
import { Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Avatar, ErrorBox, Spinner } from '@/components/ui';
import { accentStyle, MODULE_LOOK } from '@/app/module-look';
import { acct } from '@/lib/api';
import { accountSession, useAccount } from '@/lib/account';
import { session } from '@/lib/session';
import { useAction } from '@/lib/use-api';
import { useEffect, useState } from 'react';
import { daysLeft, SUB_STATUS } from '@/lib/billing';
import { brl } from '@/lib/format';
import { StoreLayout } from './shared';

export function MyAccount() {
  const account = useAccount();
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (account) acct.get('/account/me').then((r) => { setMe(r); accountSession.patch(r.account); }, (e) => setError(e.message)); }, [account?.token]);
  const open = useAction(async (id: string) => { session.set(await acct.post(`/account/companies/${id}/session`)); nav('/', { replace: true }); });
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
      <ErrorBox error={error ?? open.error} />
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
                <button className="btn primary block" style={{ marginTop: 'auto' }} disabled={open.busy} onClick={() => void open.run(co.id)}>{open.busy ? <Spinner /> : null} Abrir ERP <Icon name="arrowRight" size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </StoreLayout>
  );
}
