import { Request, Response } from 'express';
import { PurchaseStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import * as s from './purchases.service';

const item = z.object({ variantId: z.string().uuid(), quantity: z.number().positive(), unitCost: z.number().nonnegative() });
export const getSuppliers = async (req: Request, res: Response) => res.json(await s.listSuppliers(typeof req.query.q === 'string' ? req.query.q : undefined));
export const postSupplier = async (req: Request, res: Response) => res.status(201).json(await s.createSupplier(parse(z.object({ name: z.string().min(2).max(160), document: z.string().max(20).optional(), email: z.string().email().optional(), phone: z.string().max(30).optional(), notes: z.string().optional() }), req.body)));
export const patchSupplier = async (req: Request, res: Response) => res.json(await s.updateSupplier(String(req.params.id), parse(z.object({ name: z.string().min(2).optional(), email: z.string().email().optional(), phone: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional() }), req.body)));

export const getPurchases = async (req: Request, res: Response) => res.json(await s.list(parse(z.object({ status: z.nativeEnum(PurchaseStatus).optional(), supplierId: z.string().uuid().optional() }), req.query)));
export const getPurchase = async (req: Request, res: Response) => res.json(await s.get(String(req.params.id)));
export const postPurchase = async (req: Request, res: Response) => res.status(201).json(await s.createPurchase(parse(z.object({ supplierId: z.string().uuid(), warehouseId: z.string().uuid().optional(), expectedAt: z.coerce.date().optional(), notes: z.string().optional(), freight: z.number().nonnegative().optional(), items: z.array(item).min(1) }), req.body)));
export const putItems = async (req: Request, res: Response) => res.json(await s.setItems(String(req.params.id), parse(z.object({ items: z.array(item).min(1) }), req.body).items));
export const postOrdered = async (req: Request, res: Response) => res.json(await s.markOrdered(String(req.params.id)));
export const postReceive = async (req: Request, res: Response) => res.json(await s.receive(String(req.params.id), parse(z.object({ items: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().positive() })).optional(), invoiceNumber: z.string().max(40).optional(), dueDate: z.coerce.date().optional() }), req.body ?? {})));
export const postCancel = async (req: Request, res: Response) => res.json(await s.cancel(String(req.params.id), parse(z.object({ reason: z.string().min(3) }), req.body).reason));
export const getSugestao = async (_req: Request, res: Response) => res.json(await s.sugestaoDeCompra());
