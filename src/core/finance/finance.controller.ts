import { Request, Response } from 'express';
import { FinanceEntryKind, FinanceEntryStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction } from '../../infra/prisma';
import { D } from '../../shared/money';
import * as finance from './finance.service';

const listSchema = z.object({
  kind: z.nativeEnum(FinanceEntryKind).optional(),
  status: z.nativeEnum(FinanceEntryStatus).optional(),
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
  const { db, tenantId } = ctx();
  const row = await tenantTransaction(db, tenantId, (tx) =>
    finance.settle(tx, tenantId, { entryId: String(req.params.id), ...b, amount: D(b.amount) }));
  res.json(row);
}
