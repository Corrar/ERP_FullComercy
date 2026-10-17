import { Request, Response } from 'express';
import { RefundMethod } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as pdv from '../services/pdv.service';
import * as grade from '../services/grade.service';
import * as etiquetas from '../services/etiquetas.service';
import * as comissao from '../services/comissao.service';
import * as dev from '../services/devolucoes.service';
import * as rel from '../services/relatorios.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const faixa = (q: { from?: Date; to?: Date }) => { const ini = q.from ?? new Date(new Date().setDate(1)); return [ini, q.to ?? new Date()] as const; };

// ── Caixa ──
export const postAbrirCaixa = async (req: Request, res: Response) => {
  const b = parse(z.object({ terminal: z.string().max(40).default('CAIXA-1'), openingAmount: z.number().nonnegative().default(0) }), req.body);
  res.status(201).json(await pdv.abrirCaixa(b.terminal, b.openingAmount));
};
export const postFecharCaixa = async (req: Request, res: Response) => {
  const b = parse(z.object({ closingAmount: z.number().nonnegative(), notes: z.string().optional() }), req.body);
  res.json(await pdv.fecharCaixa(String(req.params.id), b.closingAmount, b.notes));
};
export const getResumoCaixa = async (req: Request, res: Response) => res.json(await pdv.resumoCaixa(String(req.params.id)));
export const getSessoes = async (req: Request, res: Response) => res.json(await pdv.listarSessoes(parse(z.object({ status: z.enum(['OPEN', 'CLOSED']).optional(), terminal: z.string().optional() }), req.query)));
export const getSessaoAtual = async (req: Request, res: Response) => res.json(await pdv.sessaoAbertaDoTerminal(String(req.query.terminal ?? 'CAIXA-1')));
export const postMovimentoCaixa = async (req: Request, res: Response) => {
  const b = parse(z.object({ kind: z.enum(['SANGRIA', 'SUPRIMENTO']), amount: z.number().positive(), note: z.string().max(200).optional() }), req.body);
  res.status(201).json(await pdv.movimentoDeCaixa(String(req.params.id), b.kind, b.amount, b.note));
};

// ── Grade ──
export const getEixos = async (_req: Request, res: Response) => res.json(await grade.listarEixos());
export const postEixo = async (req: Request, res: Response) => res.status(201).json(await grade.criarEixo(parse(z.object({ name: z.string().min(1).max(40) }), req.body).name));
export const postValor = async (req: Request, res: Response) => {
  const b = parse(z.object({ value: z.string().min(1).max(40), hexColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }), req.body);
  res.status(201).json(await grade.criarValor(String(req.params.axisId), b.value, b.hexColor));
};
export const postGerarGrade = async (req: Request, res: Response) => {
  const b = parse(z.object({ productId: z.string().uuid(), skuBase: z.string().min(1).max(30), eixos: z.record(z.array(z.string().min(1)).min(1)) }), req.body);
  res.status(201).json(await grade.gerarGrade(b));
};
export const getMatrizEstoque = async (req: Request, res: Response) =>
  res.json(await grade.matrizDeEstoque(String(req.params.productId), typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined));

// ── Etiquetas ──
export const getModelos = async (_req: Request, res: Response) => res.json(await etiquetas.listarModelos());
export const postModelo = async (req: Request, res: Response) => res.status(201).json(await etiquetas.criarModelo(parse(z.object({ name: z.string().min(1).max(80), widthMm: z.number().positive(), heightMm: z.number().positive(), layout: z.record(z.unknown()).optional(), isDefault: z.boolean().optional() }), req.body)));
export const postLoteEtiquetas = async (req: Request, res: Response) => {
  const b = parse(z.object({ templateId: z.string().uuid().optional(), itens: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive() })).min(1) }), req.body);
  res.status(201).json(await etiquetas.criarLote(b));
};
export const getLoteExpandido = async (req: Request, res: Response) => res.json(await etiquetas.expandirLote(String(req.params.id)));
export const getLoteZpl = async (req: Request, res: Response) => { res.type('text/plain').send(await etiquetas.renderZpl(String(req.params.id))); };
export const postLoteImpresso = async (req: Request, res: Response) => res.json(await etiquetas.marcarImpresso(String(req.params.id)));

// ── Vendedores e comissões ──
export const getVendedores = async (_req: Request, res: Response) => res.json(await ctx().db.retailSalesperson.findMany({ orderBy: { name: 'asc' } }));
export const postVendedor = async (req: Request, res: Response) => {
  const b = parse(z.object({ name: z.string().min(2), userId: z.string().uuid().optional(), defaultCommissionRate: z.number().min(0).max(100).default(0) }), req.body);
  res.status(201).json(await ctx().db.retailSalesperson.create({ data: { ...b, tenantId: ctx().tenantId } }));
};
export const patchVendedor = async (req: Request, res: Response) => {
  const b = parse(z.object({ name: z.string().min(2).optional(), defaultCommissionRate: z.number().min(0).max(100).optional(), isActive: z.boolean().optional() }), req.body);
  res.json(await ctx().db.retailSalesperson.update({ where: { id: String(req.params.id) }, data: b }));
};
export const getComissoes = async (req: Request, res: Response) => {
  const q = parse(z.object({ salespersonId: z.string().uuid().optional(), status: z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']).optional() }), req.query);
  res.json(await comissao.listarComissoes(q));
};
export const getRegras = async (_req: Request, res: Response) => res.json(await comissao.listarRegras());
export const postRegra = async (req: Request, res: Response) => res.status(201).json(await comissao.criarRegra(parse(z.object({ salespersonId: z.string().uuid().optional(), categoryId: z.string().uuid().optional(), rate: z.number().min(0).max(100), validFrom: z.coerce.date(), validTo: z.coerce.date().optional() }), req.body)));
export const deleteRegra = async (req: Request, res: Response) => { await comissao.removerRegra(String(req.params.id)); res.status(204).end(); };
export const postAprovarComissoes = async (req: Request, res: Response) => res.json(await comissao.aprovarComissoes(parse(z.object({ ids: z.array(z.string().uuid()).min(1) }), req.body).ids));
export const postPagarComissoes = async (req: Request, res: Response) => {
  const b = parse(z.object({ salespersonId: z.string().uuid(), until: z.coerce.date().default(new Date()) }), req.body);
  res.json(await comissao.pagarComissoes(b.salespersonId, b.until));
};

// ── Devoluções ──
export const postDevolucao = async (req: Request, res: Response) => res.status(201).json(await dev.criarDevolucao(parse(z.object({
  saleId: z.string().uuid(), refundMethod: z.nativeEnum(RefundMethod), reason: z.string().max(500).optional(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().positive(), restock: z.boolean().optional(), condition: z.string().max(40).optional() })).min(1),
}), req.body)));
export const getDevolucoes = async (req: Request, res: Response) => res.json(await dev.listarDevolucoes(parse(z.object({ saleId: z.string().uuid().optional() }).merge(periodo), req.query)));
export const getVales = async (req: Request, res: Response) => res.json(await dev.valesDoCliente(String(req.params.customerId)));

// ── Relatórios ──
export const getRelVendedores = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.vendasPorVendedor(a, b)); };
export const getRelHoras = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.vendasPorHora(a, b)); };
export const getRelAbc = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.curvaAbc(a, b)); };
export const getRelSemGiro = async (req: Request, res: Response) => res.json(await rel.semGiro(Number(req.query.dias ?? 60)));
