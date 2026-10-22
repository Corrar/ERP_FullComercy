import { Request, Response } from 'express';
import { ProductKind } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { paginacaoSchema } from '../../shared/paginacao';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction } from '../../infra/prisma';
import { D } from '../../shared/money';
import * as products from './products.service';
import * as stock from './stock.service';

const createSchema = z.object({
  name: z.string().min(1).max(160),
  sku: z.string().min(1).max(60),
  barcode: z.string().max(60).optional(),
  kind: z.nativeEnum(ProductKind).optional(),
  unit: z.string().max(6).optional(),
  categoryId: z.string().uuid().optional(),
  costPrice: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().optional(),
  trackStock: z.boolean().optional(),
  hasVariants: z.boolean().optional(),
  description: z.string().optional(),
});

export async function getProducts(req: Request, res: Response) {
  res.json(await products.listProducts(typeof req.query.q === 'string' ? req.query.q : undefined, parse(paginacaoSchema, req.query)));
}
export async function postProduct(req: Request, res: Response) {
  res.status(201).json(await products.createProduct(parse(createSchema, req.body)));
}

export async function getBalances(req: Request, res: Response) {
  const variantId = typeof req.query.variantId === 'string' ? req.query.variantId : undefined;
  res.json(await ctx().db.stockBalance.findMany({
    where: variantId ? { variantId } : undefined,
    include: { variant: { include: { product: { select: { name: true } } } }, warehouse: { select: { code: true } } },
    take: 500,
  }));
}

const moveSchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  kind: z.enum(['RECEIVE', 'ADJUST', 'CONSUME']),
  quantity: z.number(),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().max(120).optional(),
});

/** Movimento manual (entrada de compra, acerto de inventário, perda). */
export async function postMovement(req: Request, res: Response) {
  const b = parse(moveSchema, req.body);
  const { db, tenantId, userId } = ctx();
  const warehouseId = b.warehouseId ?? (await products.defaultWarehouseId());
  const g = { tenantId, variantId: b.variantId, warehouseId };
  const ref = { refType: 'MANUAL', userId, note: b.note, idempotencyKey: b.idempotencyKey ?? req.get('x-idempotency-key') ?? null };
  const out = await tenantTransaction(db, tenantId, (tx) => {
    if (b.kind === 'RECEIVE') return stock.receive(tx, g, D(b.quantity), ref);
    if (b.kind === 'CONSUME') return stock.consume(tx, g, D(b.quantity), ref);
    return stock.adjustTo(tx, g, D(b.quantity), ref);
  });
  res.status(out ? 201 : 200).json(out ?? { applied: false, reason: 'idempotent' });
}
