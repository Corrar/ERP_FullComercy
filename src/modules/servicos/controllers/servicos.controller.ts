import { Request, Response } from 'express';
import { MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as veiculos from '../services/veiculos.service';
import * as os from '../services/os.service';

export const getVeiculoPorPlaca = async (req: Request, res: Response) => res.json(await veiculos.buscarPorPlaca(String(req.params.plate)));
export const postVeiculo = async (req: Request, res: Response) => {
  const b = parse(z.object({ customerId: z.string().uuid(), plate: z.string().min(7), brand: z.string().optional(), model: z.string().optional(), year: z.number().int().optional(), color: z.string().optional(), vin: z.string().optional(), mileage: z.number().int().optional() }), req.body);
  res.status(201).json(await veiculos.cadastrar(b));
};
export const getPainel = async (_req: Request, res: Response) => res.json(await os.painel());
export const postMoverOS = async (req: Request, res: Response) => {
  const b = parse(z.object({ to: z.nativeEnum(MaintenanceStatus), note: z.string().optional(), diagnosis: z.string().optional() }), req.body);
  res.json(await os.moverOS(String(req.params.id), b.to, b));
};
export const getCatalogo = async (_req: Request, res: Response) => res.json(await ctx().db.svcServiceCatalogItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));
export const postCatalogo = async (req: Request, res: Response) => {
  const b = parse(z.object({ name: z.string().min(2), defaultPrice: z.number().nonnegative(), estimatedMinutes: z.number().int().positive().optional(), productId: z.string().uuid().optional() }), req.body);
  res.status(201).json(await ctx().db.svcServiceCatalogItem.create({ data: { ...b, tenantId: ctx().tenantId } }));
};
