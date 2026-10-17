import { Request, Response } from 'express';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as pdv from '../services/pdv.service';
import * as grade from '../services/grade.service';
import * as etiquetas from '../services/etiquetas.service';
import * as comissao from '../services/comissao.service';

export const postAbrirCaixa = async (req: Request, res: Response) => {
  const b = parse(z.object({ terminal: z.string().max(40).default('CAIXA-1'), openingAmount: z.number().nonnegative().default(0) }), req.body);
  res.status(201).json(await pdv.abrirCaixa(b.terminal, b.openingAmount));
};
export const postFecharCaixa = async (req: Request, res: Response) => {
  const b = parse(z.object({ closingAmount: z.number().nonnegative(), notes: z.string().optional() }), req.body);
  res.json(await pdv.fecharCaixa(String(req.params.id), b.closingAmount, b.notes));
};
export const getResumoCaixa = async (req: Request, res: Response) => res.json(await pdv.resumoCaixa(String(req.params.id)));

export const postGerarGrade = async (req: Request, res: Response) => {
  const b = parse(z.object({ productId: z.string().uuid(), skuBase: z.string().min(1).max(30), eixos: z.record(z.array(z.string().min(1)).min(1)) }), req.body);
  res.status(201).json(await grade.gerarGrade(b));
};
export const getMatrizEstoque = async (req: Request, res: Response) =>
  res.json(await grade.matrizDeEstoque(String(req.params.productId), typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined));

export const postLoteEtiquetas = async (req: Request, res: Response) => {
  const b = parse(z.object({ templateId: z.string().uuid().optional(), itens: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive() })).min(1) }), req.body);
  res.status(201).json(await etiquetas.criarLote(b));
};
export const getLoteExpandido = async (req: Request, res: Response) => res.json(await etiquetas.expandirLote(String(req.params.id)));

export const getVendedores = async (_req: Request, res: Response) => res.json(await ctx().db.retailSalesperson.findMany({ orderBy: { name: 'asc' } }));
export const postVendedor = async (req: Request, res: Response) => {
  const b = parse(z.object({ name: z.string().min(2), userId: z.string().uuid().optional(), defaultCommissionRate: z.number().min(0).max(100).default(0) }), req.body);
  res.status(201).json(await ctx().db.retailSalesperson.create({ data: { ...b, tenantId: ctx().tenantId } }));
};
export const getComissoes = async (req: Request, res: Response) => {
  const q = parse(z.object({ salespersonId: z.string().uuid().optional(), status: z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']).optional() }), req.query);
  res.json(await comissao.listarComissoes(q));
};
