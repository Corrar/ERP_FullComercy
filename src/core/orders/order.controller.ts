import { Request, Response } from 'express';
import { ModuleKey, OrderChannel, OrderItemKind, OrderStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../shared/http';
import * as orders from './order.service';

const itemSchema = z.object({
  variantId: z.string().uuid().optional(),
  code: z.string().max(60).optional(),
  kind: z.nativeEnum(OrderItemKind).optional(),
  description: z.string().max(200).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
const paymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive(),
  installments: z.number().int().positive().optional(),
  reference: z.string().max(120).optional(),
});
export const createOrderSchema = z.object({
  moduleKey: z.nativeEnum(ModuleKey).nullable().optional(),
  channel: z.nativeEnum(OrderChannel).optional(),
  customerId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  sellerUserId: z.string().uuid().nullable().optional(),
  /** Pode vir vazio quando o módulo injeta as linhas (adesão a plano). O service valida depois. */
  items: z.array(itemSchema).default([]),
  payments: z.array(paymentSchema).optional(),
  discount: z.number().nonnegative().optional(),
  surcharge: z.number().nonnegative().optional(),
  notes: z.string().max(1000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  moduleData: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().max(120).nullable().optional(),
});

export async function postOrder(req: Request, res: Response) {
  const b = parse(createOrderSchema, req.body);
  const idem = b.idempotencyKey ?? req.get('x-idempotency-key') ?? null;
  res.status(201).json(await orders.createOrder({ ...b, idempotencyKey: idem }));
}

export async function getOrder(req: Request, res: Response) {
  res.json(await orders.getOrder(String(req.params.id)));
}

const listSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  moduleKey: z.nativeEnum(ModuleKey).optional(),
  customerId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  q: z.string().max(80).optional(),
});

export async function postItems(req: Request, res: Response) {
  const b = parse(z.object({ items: z.array(itemSchema).min(1) }), req.body);
  res.json(await orders.addItems(String(req.params.id), b.items));
}
export async function deleteItem(req: Request, res: Response) {
  const b = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
  res.json(await orders.removeItem(String(req.params.id), String(req.params.itemId), b.reason));
}
export async function getDashboard(req: Request, res: Response) {
  const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), req.query);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  res.json(await orders.dashboard(q.from ?? hoje, q.to ?? new Date()));
}
export async function getOrders(req: Request, res: Response) {
  res.json(await orders.listOrders(parse(listSchema, req.query)));
}

export async function postPayments(req: Request, res: Response) {
  const b = parse(z.object({ payments: z.array(paymentSchema).min(1) }), req.body);
  res.json(await orders.addPayments(String(req.params.id), b.payments));
}

export async function postTransition(req: Request, res: Response) {
  const b = parse(z.object({ to: z.nativeEnum(OrderStatus), note: z.string().max(500).optional() }), req.body);
  res.json(await orders.transition(String(req.params.id), b.to, b.note));
}

export async function postCancel(req: Request, res: Response) {
  const b = parse(z.object({ reason: z.string().min(3).max(500) }), req.body);
  res.json(await orders.cancelOrder(String(req.params.id), b.reason));
}
