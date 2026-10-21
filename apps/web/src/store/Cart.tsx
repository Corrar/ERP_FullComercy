// src/store/Cart.tsx — o carrinho: o ERP montado, o total do servidor e o aviso do teste grátis.
// Finalizar exige estar logado: sem conta, vai para o login e volta para o pagamento.
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { ErrorBox, Steps } from '@/components/ui';
import { cart, useCart } from '@/lib/cart';
import { useAccount } from '@/lib/account';
import { useCatalog, useQuote } from '@/lib/billing';
import { brl, d } from '@/lib/format';
import { MODULE_SLUG, ModuleBadge, MobileBar, StoreLayout } from './shared';

export function Cart() {
  const c = useCart();
  const { data: catalog, error } = useCatalog();
  const { quote, error: qErr } = useQuote(c);
  const account = useAccount();
  const nav = useNavigate();
  if (!c.modules.length) return <Navigate to="/comecar" replace />;
  const m = c.modules[0];
  const trial = account ? account.account.trialAvailable : true;
  const trialEnd = catalog ? new Date(Date.now() + catalog.trialDays * 86_400_000) : null;
  const finish = () => nav(account ? '/checkout' : '/login?next=/checkout');
  const byKey = new Map((catalog?.features ?? []).map((f) => [f.key, f]));

  return (
    <StoreLayout module={m} step={<Steps current={2} />}>
      <h1>Seu carrinho</h1>
      <ErrorBox error={error ?? qErr} />
      <div className="cfg">
        <div className="card stack" style={{ gap: 4 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            {catalog && <ModuleBadge m={m} catalog={catalog} />}
            <Link className="btn soft" to={`/comecar/${MODULE_SLUG[m]}`}><Icon name="sliders" size={15} /> Ajustar funções</Link>
          </div>
          {!quote ? <div className="skel" style={{ height: 200 }} /> : quote.items.map((i) => (
            <div key={i.key} className="row between" style={{ padding: '12px 0', borderTop: '1px solid var(--line)', flexWrap: 'nowrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{i.label}</div>
                <div className="muted small">{i.reason === 'selected' ? 'Escolhida por você' : i.reason === 'required' ? 'Essencial' : `Exigida por ${byKey.get(i.requiredBy ?? '')?.label ?? 'outra função'}`}</div>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="mono" style={{ fontWeight: 750 }}>{brl(i.price)}</span>
                {i.reason === 'selected' && <button className="btn icon ghost" onClick={() => cart.toggle(i.key)} aria-label={`Remover ${i.label}`} title="Remover"><Icon name="trash" size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
        <aside className="summary">
          <div className="card stack" style={{ gap: 14 }}>
            <div className="row between"><span className="muted">Mensalidade</span><span className="mono" style={{ fontWeight: 800, fontSize: 22 }} data-testid="total">{quote ? brl(quote.total) : '—'}</span></div>
            {trial && catalog && catalog.trialDays > 0 ? (
              <>
                <div className="line"><span>Hoje</span><b className="mono">{brl(0)}</b></div>
                <div className="line"><span>A partir de {d(trialEnd)}</span><b className="mono">{quote ? brl(quote.total) : '—'}/mês</b></div>
                <div className="trial"><Icon name="gift" size={18} /><span>{catalog.trialDays} dias grátis para testar tudo. Cancele antes e não paga nada.</span></div>
              </>
            ) : <div className="muted small">A primeira mensalidade é cobrada ao finalizar.</div>}
            <button className="btn primary lg block" onClick={finish} disabled={!quote}>{account ? 'Continuar para pagamento' : 'Entrar para finalizar'} <Icon name="arrowRight" /></button>
            <button className="btn block" onClick={() => nav('/previa')} disabled={!quote}><Icon name="eye" /> Visualizar meu ERP</button>
            {!account && <div className="muted small" style={{ textAlign: 'center' }}>Para finalizar é preciso entrar na sua conta (ou criar uma, leva 1 minuto).</div>}
          </div>
        </aside>
      </div>
      <MobileBar quote={quote}><button className="btn primary lg" onClick={finish} disabled={!quote}>{account ? 'Pagamento' : 'Entrar'} <Icon name="arrowRight" /></button></MobileBar>
    </StoreLayout>
  );
}
