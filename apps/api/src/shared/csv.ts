// src/shared/csv.ts — `?format=csv` em QUALQUER rota que responda um array de objetos planos.
// O middleware troca `res.json` por uma versão que, quando pedido, serializa em CSV (UTF-8 com BOM,
// separador `;`, decimal com vírgula — o que o Excel brasileiro abre sem perguntar nada).
import type { NextFunction, Request, Response } from 'express';

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    // Decimal do Prisma tem toFixed; objetos aninhados viram JSON.
    const d = v as { toFixed?: (n: number) => string; d?: unknown };
    if (typeof d.toFixed === 'function' && 'd' in d) return d.toFixed(2).replace('.', ',');
    return JSON.stringify(v);
  }
  if (typeof v === 'number') return String(v).replace('.', ',');
  // Injeção de fórmula: texto que começa com = + - @ (ou tab/CR) o Excel executa. Nome de cliente
  // vem até de pedido público; o apóstrofo faz a planilha mostrar o texto como texto.
  const s = /^[=+\-@\t\r]/.test(String(v)) ? `'${String(v)}` : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\r\n');
}

export function csvMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.query.format !== 'csv') return next();
  const original = res.json.bind(res);
  res.json = ((body: unknown) => {
    const rows = Array.isArray(body) ? body : (body && typeof body === 'object' && Array.isArray((body as { rows?: unknown }).rows)) ? (body as { rows: unknown[] }).rows : null;
    if (!rows) return original(body);
    const nome = (req.path.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'export') + '.csv';
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${nome}"`);
    return res.send(toCsv(rows as Record<string, unknown>[]));
  }) as Response['json'];
  next();
}
