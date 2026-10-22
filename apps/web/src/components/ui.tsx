// src/components/ui.tsx — primitivas de interface. Pequenas, sem dependência, e é só isto que as
// telas usam: trocar o visual é trocar este arquivo e o styles.css.
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { brl, st, tone } from '@/lib/format';
import { Icon } from './icons';

export const Card = ({ title, children, actions, className = '' }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{(title || actions) && <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><div className="row">{actions}</div></div>}{children}</section>
);
export const Kpi = ({ label, value, money }: { label: string; value: unknown; money?: boolean }) => (
  <div className="card kpi hover"><div className="label">{label}</div><div className="value mono">{money ? brl(value) : String(value ?? '—')}</div></div>
);
export const Badge = ({ s }: { s: string }) => <span className={`badge ${tone(s)}`}>{st(s)}</span>;
export const Money = ({ v }: { v: unknown }) => <span className="mono">{brl(v)}</span>;
export const Empty = ({ children = 'Nada por aqui ainda.' }: { children?: ReactNode }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }: { error: string | null }) => (error ? <div className="error-box" role="alert"><Icon name="alert" size={16} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span></div> : null);

export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

export function Modal({ title, open, onClose, children, wide }: { title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (!open) return null;
  // Portal no <body>: o modal nunca fica DENTRO do formulário de quem o abriu (form dentro de form
  // é HTML inválido — o do Google simulado no login escapava como GET para a URL; achado no e2e).
  return createPortal(<div className="modal-bg" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(880px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()}><div className="row between" style={{ marginBottom: 14 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="btn icon ghost" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button></div>{children}</div></div>, document.body);
}

/** Formulário genérico: coleta campos nomeados num objeto (números viram number). */
export function Form({ onSubmit, children, busy, submitLabel = 'Salvar' }: { onSubmit: (v: Record<string, any>) => void; children: ReactNode; busy?: boolean; submitLabel?: string }) {
  const handle = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget); const out: Record<string, any> = {};
    fd.forEach((v, k) => { const el = e.currentTarget.elements.namedItem(k) as HTMLInputElement | null; if (v === '' && el?.type !== 'checkbox') return; out[k] = el?.type === 'number' ? Number(v) : el?.type === 'checkbox' ? el.checked : v; });
    onSubmit(out);
  };
  return <form onSubmit={handle} className="grid" style={{ gap: 12 }}>{children}<div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy}>{busy ? '…' : submitLabel}</button></div></form>;
}

export function Table<T extends { id?: string }>({ rows, cols, onRow, empty }: { rows: T[] | null | undefined; cols: { h: string; c: (r: T) => ReactNode; right?: boolean }[]; onRow?: (r: T) => void; empty?: string }) {
  if (!rows) return <div className="muted">Carregando…</div>;
  if (!rows.length) return <Empty>{empty}</Empty>;
  return <div className="table-wrap scroll"><table className="table"><thead><tr>{cols.map((c) => <th key={c.h} className={c.right ? 'right' : ''}>{c.h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>{cols.map((c) => <td key={c.h} className={c.right ? 'right' : ''}>{c.c(r)}</td>)}</tr>)}</tbody></table></div>;
}

export function Toast({ msg }: { msg: string | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!msg) return; setShow(true); const t = setTimeout(() => setShow(false), 3000); return () => clearTimeout(t); }, [msg]);
  return show && msg ? <div className="toast" role="status" aria-live="polite">{msg}</div> : null;
}

export function Tabs({ tabs, active, onChange }: { tabs: { k: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.k} role="tab" aria-selected={active === t.k} className={active === t.k ? 'on' : ''} onClick={() => onChange(t.k)}>{t.label}</button>)}</div>;
}

/** Interruptor liga/desliga (as funções do configurador). */
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onChange?.(!on); }} />;
}

export const Spinner = () => <span className="spin" aria-hidden="true" />;

/** Etapas da compra (Comércio → Funções → Carrinho → Pagamento). */
export function Steps({ current }: { current: number }) {
  const labels = ['Comércio', 'Funções', 'Carrinho', 'Pagamento'];
  return <nav className="steps" aria-label="Etapas">{labels.map((l, i) => <div key={l} className="row" style={{ gap: 8 }}>
    {i > 0 && <span className="step-sep" />}
    <div className={`step ${i === current ? 'on' : i < current ? 'done' : ''}`} aria-current={i === current ? 'step' : undefined}><span className="n">{i < current ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span><span className="lbl">{l}</span></div>
  </div>)}</nav>;
}

export function Avatar({ name, src }: { name?: string | null; src?: string | null }) {
  return <span className="avatar">{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : (name ?? '?').trim().charAt(0).toUpperCase() || '?'}</span>;
}

/** Paginador das listagens paginadas (`{ rows, page, pageSize, total }` da API). */
export function Paginador({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  if (paginas === 1) return <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{total} registro(s)</div>;
  return <nav className="row between" aria-label="Paginação" style={{ marginTop: 8, flexWrap: 'wrap' }}>
    <span className="muted" style={{ fontSize: 13 }}>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</span>
    <div className="row"><button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><span className="muted" style={{ fontSize: 13 }}>Página {page} de {paginas}</span><button className="btn" disabled={page >= paginas} onClick={() => onPage(page + 1)}>Próxima</button></div>
  </nav>;
}
