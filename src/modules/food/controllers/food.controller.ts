import { Request, Response } from 'express';
import { DeliveryStatus, KitchenStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as mesas from '../services/mesas.service';
import * as cozinha from '../services/cozinha.service';
import * as entregas from '../services/entregadores.service';
import * as cardapio from '../services/cardapio.service';

export const getMesas = async (_req: Request, res: Response) => res.json(await ctx().db.foodTable.findMany({ where: { isActive: true }, orderBy: { number: 'asc' }, include: { tabs: { where: { status: 'OPEN' } } } }));
export const postMesa = async (req: Request, res: Response) => {
  const b = parse(z.object({ number: z.number().int().positive(), name: z.string().optional(), area: z.string().optional(), seats: z.number().int().positive().optional() }), req.body);
  res.status(201).json(await ctx().db.foodTable.create({ data: { ...b, tenantId: ctx().tenantId } }));
};
export const postComanda = async (req: Request, res: Response) => {
  const b = parse(z.object({ code: z.string().min(1).max(20), tableId: z.string().uuid().optional(), customerName: z.string().optional(), guests: z.number().int().positive().optional() }), req.body);
  res.status(201).json(await mesas.abrirComanda(b));
};
export const getConta = async (req: Request, res: Response) => res.json(await mesas.contaDaComanda(String(req.params.id)));
export const postFecharComanda = async (req: Request, res: Response) => {
  const b = parse(z.object({ payments: z.array(z.object({ method: z.nativeEnum(PaymentMethod), amount: z.number().positive() })).min(1), cobrarTaxa: z.boolean().default(true) }), req.body);
  res.json(await mesas.fecharComanda(String(req.params.id), b.payments, b.cobrarTaxa));
};

export const getFila = async (req: Request, res: Response) => res.json(await cozinha.filaDaEstacao(typeof req.query.station === 'string' ? req.query.station : undefined));
export const postMoverTicket = async (req: Request, res: Response) => {
  const b = parse(z.object({ to: z.nativeEnum(KitchenStatus) }), req.body);
  res.json(await cozinha.moverTicket(String(req.params.id), b.to));
};

export const getEntregas = async (_req: Request, res: Response) => res.json(await entregas.painelEntregas());
export const postAtribuir = async (req: Request, res: Response) => {
  const b = parse(z.object({ courierId: z.string().uuid() }), req.body);
  res.json(await entregas.atribuirEntregador(String(req.params.id), b.courierId));
};
export const postMoverEntrega = async (req: Request, res: Response) => {
  const b = parse(z.object({ to: z.nativeEnum(DeliveryStatus), failReason: z.string().optional() }), req.body);
  res.json(await entregas.moverEntrega(String(req.params.id), b.to, b));
};
export const getEntregadores = async (_req: Request, res: Response) => res.json(await ctx().db.foodCourier.findMany({ orderBy: { name: 'asc' } }));
export const postEntregador = async (req: Request, res: Response) => {
  const b = parse(z.object({ name: z.string().min(2), phone: z.string().optional(), vehicle: z.string().optional(), plate: z.string().optional(), userId: z.string().uuid().optional() }), req.body);
  res.status(201).json(await ctx().db.foodCourier.create({ data: { ...b, tenantId: ctx().tenantId } }));
};

export const getMenus = async (_req: Request, res: Response) => res.json(await cardapio.listarMenus());
export const getCardapioPublico = async (req: Request, res: Response) => res.json(await cardapio.cardapioPublico(String(req.params.tenant), String(req.params.menu)));
