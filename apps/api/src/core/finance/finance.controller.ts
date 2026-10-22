import { Request, Response } from 'express';
import { FinanceEntryKind, FinanceEntryStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { paginacaoSchema } from '../../shared/paginacao';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction } from '../../infra/prisma';
import { D } from '../../shared/money';
import * as finance from './finance.service';
import * as dre from './dre.service';

const listSchema = paginacaoSchema.extend({
  kind: z.nativeEnum(FinanceEntryKind).optional(),
  status: z.nativeEnum(FinanceEntryStatus).optional(),
  /** 1 = só em aberto (OPEN ou PARTIAL): o filtro da tela, feito no banco para valer com paginação. */
  abertos: z.enum(['0', '1']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export async function getEntries(req: Request, res: Response) {
  res.json(await finance.listEntries(parse(listSchema, req.query)));
}

const createSchema = z.object({
  kind: z.nativeEnum(FinanceEntryKind),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  dueDate: z.coerce.date(),
  customerId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});
export async function postEntry(req: Request, res: Response) {
  const b = parse(createSchema, req.body);
  const { db, tenantId } = ctx();
  const row = await tenantTransaction(db, tenantId, (tx) =>
    finance.createEntry(tx, tenantId, { ...b, amount: D(b.amount), origin: 'MANUAL' }));
  res.status(201).json(row);
}

const settleSchema = z.object({
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  accountId: z.string().uuid().optional(),
  reference: z.string().max(120).optional(),
});
export async function postSettle(req: Request, res: Response) {
  const b = parse(settleSchema, req.body);
  res.json(await finance.baixaManual({ entryId: String(req.params.id), ...b, amount: D(b.amount) }));
}

export const getAccounts = async (_req: Request, res: Response) => res.json(await finance.listAccounts());
export const postAccount = async (req: Request, res: Response) => res.status(201).json(await finance.createAccount(parse(z.object({ name: z.string().min(1).max(80), kind: z.enum(['CASH', 'BANK', 'DIGITAL']).default('CASH'), isDefault: z.boolean().optional() }), req.body)));
export const getCategories = async (_req: Request, res: Response) => res.json(await finance.listCategories());
export const postCategory = async (req: Request, res: Response) => res.status(201).json(await finance.createCategory(parse(z.object({ name: z.string().min(1).max(80), kind: z.nativeEnum(FinanceEntryKind) }), req.body)));
export const postCancel = async (req: Request, res: Response) => res.json(await finance.cancelEntry(String(req.params.id), parse(z.object({ reason: z.string().min(3) }), req.body).reason));
export const patchEntry = async (req: Request, res: Response) => res.json(await finance.updateEntry(String(req.params.id), parse(z.object({ description: z.string().max(200).optional(), dueDate: z.coerce.date().optional(), categoryId: z.string().uuid().nullable().optional(), notes: z.string().optional(), amount: z.number().positive().optional() }), req.body)));
export const getSummary = async (req: Request, res: Response) => {
  const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), req.query);
  const ini = q.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  res.json(await finance.summary(ini, q.to ?? new Date()));
};

// DRE do período [from, to): padrão = mês corrente. `?format=pdf` devolve o PDF.
export const getDre = async (req: Request, res: Response) => {
  const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), format: z.enum(['json', 'pdf']).default('json') }), req.query);
  const ini = q.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const fim = q.to ?? new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
  const r = await dre.dre(ini, fim);
  if (q.format !== 'pdf') return res.json(r);
  const t = await ctx().db.tenant.findUnique({ where: { id: ctx().tenantId }, select: { name: true } });
  res.type('application/pdf').setHeader('content-disposition', `attachment; filename="dre-${ini.toISOString().slice(0, 10)}.pdf"`).send(await dre.drePdf(r, t?.name ?? 'Empresa'));
};
