import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http';
import { ctx } from '../tenancy/tenant-context';
import { tenantTransaction } from '../../infra/prisma';
import { D } from '../../shared/money';
import * as cat from './catalog.service';
import * as stock from './stock.service';

export const getWarehouses = async (_req: Request, res: Response) => res.json(await cat.listWarehouses());
export const postWarehouse = async (req: Request, res: Response) => res.status(201).json(await cat.createWarehouse(parse(z.object({ code: z.string().min(1).max(20), name: z.string().min(1).max(80), isDefault: z.boolean().optional() }), req.body)));
export const patchWarehouse = async (req: Request, res: Response) => res.json(await cat.updateWarehouse(String(req.params.id), parse(z.object({ name: z.string().optional(), isActive: z.boolean().optional(), isDefault: z.boolean().optional() }), req.body)));

export const getCategories = async (_req: Request, res: Response) => res.json(await cat.listCategories());
export const postCategory = async (req: Request, res: Response) => res.status(201).json(await cat.createCategory(parse(z.object({ name: z.string().min(1).max(80), parentId: z.string().uuid().optional(), position: z.number().int().optional() }), req.body)));
export const patchCategory = async (req: Request, res: Response) => res.json(await cat.updateCategory(String(req.params.id), parse(z.object({ name: z.string().optional(), parentId: z.string().uuid().nullable().optional(), position: z.number().int().optional() }), req.body)));

export const getProduct = async (req: Request, res: Response) => res.json(await cat.getProduct(String(req.params.id)));
export const patchProduct = async (req: Request, res: Response) => res.json(await cat.updateProduct(String(req.params.id), parse(z.object({
  name: z.string().min(1).max(160).optional(), description: z.string().optional(), categoryId: z.string().uuid().nullable().optional(), unit: z.string().max(6).optional(),
  costPrice: z.number().nonnegative().optional(), salePrice: z.number().nonnegative().optional(), trackStock: z.boolean().optional(), isActive: z.boolean().optional(),
  imageUrl: z.string().url().nullable().optional(), attributes: z.record(z.unknown()).optional(),
}), req.body)));
export const postVariant = async (req: Request, res: Response) => res.status(201).json(await cat.createVariant(String(req.params.id), parse(z.object({
  sku: z.string().min(1).max(60), barcode: z.string().max(60).optional(), name: z.string().max(160).optional(), attributes: z.record(z.unknown()).optional(),
  priceOverride: z.number().nonnegative().optional(), costOverride: z.number().nonnegative().optional(),
}), req.body)));
export const patchVariant = async (req: Request, res: Response) => res.json(await cat.updateVariant(String(req.params.variantId), parse(z.object({
  sku: z.string().min(1).max(60).optional(), barcode: z.string().max(60).nullable().optional(), name: z.string().max(160).optional(),
  priceOverride: z.number().nonnegative().nullable().optional(), costOverride: z.number().nonnegative().nullable().optional(), isActive: z.boolean().optional(),
}), req.body)));

export const putMinLevel = async (req: Request, res: Response) => {
  const b = parse(z.object({ warehouseId: z.string().uuid(), minLevel: z.number().nonnegative().nullable() }), req.body);
  res.json(await cat.setMinLevel(String(req.params.variantId), b.warehouseId, b.minLevel));
};
export const getLowStock = async (_req: Request, res: Response) => res.json(await cat.lowStock());
export const getLedger = async (req: Request, res: Response) => res.json(await cat.ledger(parse(z.object({
  variantId: z.string().uuid().optional(), warehouseId: z.string().uuid().optional(), refType: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), take: z.coerce.number().int().optional(),
}), req.query)));

export const postTransfer = async (req: Request, res: Response) => {
  const b = parse(z.object({ variantId: z.string().uuid(), fromWarehouseId: z.string().uuid(), toWarehouseId: z.string().uuid(), quantity: z.number().positive(), note: z.string().optional(), idempotencyKey: z.string().max(100).optional() }), req.body);
  if (b.fromWarehouseId === b.toWarehouseId) return res.status(400).json({ error: 'Origem e destino iguais.', code: 'VALIDATION' });
  const { db, tenantId, userId } = ctx();
  const out = await tenantTransaction(db, tenantId, (tx) => stock.transfer(tx, { tenantId, variantId: b.variantId, warehouseId: b.fromWarehouseId }, b.toWarehouseId, D(b.quantity), { refType: 'TRANSFER', userId, note: b.note, idempotencyKey: b.idempotencyKey ?? req.get('x-idempotency-key') ?? null }));
  res.status(out ? 201 : 200).json(out ?? { applied: false, reason: 'idempotent' });
};
