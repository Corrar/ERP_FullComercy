// src/components/ui.tsx — primitivas de interface. Pequenas, sem dependência, e é só isto que as
// telas usam: trocar o visual é trocar este arquivo e o styles.css.
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { brl, st, tone } from '@/lib/format';

export const Card = ({ title, children, actions, className = '' }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>{(title || actions) && <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><div className="row">{actions}</div></div>}{children}</section>
);
export const Kpi = ({ label, value, money }: { label: string; value: unknown; money?: boolean }) => (
  <div className="card kpi"><div className="label">{label}</div><div className="value mono">{money ? brl(value) : String(value ?? '—')}</div></div>
);
export const Badge = ({ s }: { s: string }) => <span className={`badge ${tone(s)}`}>{st(s)}</span>;
export const Money = ({ v }: { v: unknown }) => <span className="mono">{brl(v)}</span>;
export const Empty = ({ children = 'Nada por aqui ainda.' }: { children?: ReactNode }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }: { error: string | null }) => (error ? <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 12 }}>{error}</div> : null);

export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (!open) return null;
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="btn" onClick={onClose}>✕</button></div>{children}</div></div>;
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
  return <table className="table"><thead><tr>{cols.map((c) => <th key={c.h} className={c.right ? 'right' : ''}>{c.h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>{cols.map((c) => <td key={c.h} className={c.right ? 'right' : ''}>{c.c(r)}</td>)}</tr>)}</tbody></table>;
}

export function Toast({ msg }: { msg: string | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!msg) return; setShow(true); const t = setTimeout(() => setShow(false), 3000); return () => clearTimeout(t); }, [msg]);
  return show && msg ? <div className="toast">{msg}</div> : null;
}

export function Tabs({ tabs, active, onChange }: { tabs: { k: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return <div className="row" style={{ marginBottom: 12 }}>{tabs.map((t) => <button key={t.k} className={`btn ${active === t.k ? 'primary' : ''}`} onClick={() => onChange(t.k)}>{t.label}</button>)}</div>;
}
