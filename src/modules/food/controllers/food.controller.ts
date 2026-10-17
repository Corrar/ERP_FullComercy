import { Request, Response } from 'express';
import { DeliveryStatus, KitchenStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import { ctx } from '../../../core/tenancy/tenant-context';
import * as mesas from '../services/mesas.service';
import * as cozinha from '../services/cozinha.service';
import * as entregas from '../services/entregadores.service';
import * as cardapio from '../services/cardapio.service';
import * as online from '../services/pedido-online.service';
import * as rel from '../services/relatorios.service';

const periodo = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
const faixa = (q: { from?: Date; to?: Date }) => { const ini = q.from ?? new Date(new Date().setHours(0, 0, 0, 0)); return [ini, q.to ?? new Date()] as const; };

// ── Salão ──
export const getMesas = async (_req: Request, res: Response) => res.json(await mesas.mapaDoSalao());
export const postMesa = async (req: Request, res: Response) => res.status(201).json(await ctx().db.foodTable.create({ data: { ...parse(z.object({ number: z.number().int().positive(), name: z.string().optional(), area: z.string().optional(), seats: z.number().int().positive().optional() }), req.body), tenantId: ctx().tenantId } }));
export const patchMesa = async (req: Request, res: Response) => res.json(await mesas.atualizarMesa(String(req.params.id), parse(z.object({ name: z.string().optional(), area: z.string().optional(), seats: z.number().int().positive().optional(), status: z.enum(['FREE', 'OCCUPIED', 'RESERVED', 'CLOSING']).optional(), isActive: z.boolean().optional() }), req.body)));
export const getComandas = async (_req: Request, res: Response) => res.json(await mesas.listarComandasAbertas());
export const postComanda = async (req: Request, res: Response) => res.status(201).json(await mesas.abrirComanda(parse(z.object({ code: z.string().min(1).max(20), tableId: z.string().uuid().optional(), customerName: z.string().optional(), guests: z.number().int().positive().optional() }), req.body)));
export const getConta = async (req: Request, res: Response) => res.json(await mesas.contaDaComanda(String(req.params.id)));
export const postFecharComanda = async (req: Request, res: Response) => {
  const b = parse(z.object({ payments: z.array(z.object({ method: z.nativeEnum(PaymentMethod), amount: z.number().positive() })).min(1), cobrarTaxa: z.boolean().default(true) }), req.body);
  res.json(await mesas.fecharComanda(String(req.params.id), b.payments, b.cobrarTaxa));
};
export const postTransferirComanda = async (req: Request, res: Response) => res.json(await mesas.transferirComanda(String(req.params.id), parse(z.object({ toTableId: z.string().uuid() }), req.body).toTableId));
export const postCancelarComanda = async (req: Request, res: Response) => { await mesas.cancelarComanda(String(req.params.id), parse(z.object({ reason: z.string().min(3) }), req.body).reason); res.status(204).end(); };

// ── Cozinha ──
export const getFila = async (req: Request, res: Response) => res.json(await cozinha.filaDaEstacao(typeof req.query.station === 'string' ? req.query.station : undefined));
export const getEstacoes = async (_req: Request, res: Response) => res.json(await cozinha.resumoEstacoes());
export const postMoverTicket = async (req: Request, res: Response) => res.json(await cozinha.moverTicket(String(req.params.id), parse(z.object({ to: z.nativeEnum(KitchenStatus) }), req.body).to));

// ── Entregas ──
export const getEntregas = async (_req: Request, res: Response) => res.json(await entregas.painelEntregas());
export const postAtribuir = async (req: Request, res: Response) => res.json(await entregas.atribuirEntregador(String(req.params.id), parse(z.object({ courierId: z.string().uuid() }), req.body).courierId));
export const postMoverEntrega = async (req: Request, res: Response) => { const b = parse(z.object({ to: z.nativeEnum(DeliveryStatus), failReason: z.string().optional() }), req.body); res.json(await entregas.moverEntrega(String(req.params.id), b.to, b)); };
export const getEntregadores = async (_req: Request, res: Response) => res.json(await ctx().db.foodCourier.findMany({ orderBy: { name: 'asc' } }));
export const postEntregador = async (req: Request, res: Response) => res.status(201).json(await ctx().db.foodCourier.create({ data: { ...parse(z.object({ name: z.string().min(2), phone: z.string().optional(), vehicle: z.string().optional(), plate: z.string().optional(), userId: z.string().uuid().optional() }), req.body), tenantId: ctx().tenantId } }));
export const patchEntregador = async (req: Request, res: Response) => res.json(await ctx().db.foodCourier.update({ where: { id: String(req.params.id) }, data: parse(z.object({ name: z.string().optional(), phone: z.string().optional(), vehicle: z.string().optional(), plate: z.string().optional(), isActive: z.boolean().optional() }), req.body) }));
export const getAcerto = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await entregas.acertoDoEntregador(String(req.params.id), a, b)); };
export const getZonas = async (_req: Request, res: Response) => res.json(await entregas.listarZonas());
export const postZona = async (req: Request, res: Response) => res.status(201).json(await entregas.criarZona(parse(z.object({ name: z.string().min(1), fee: z.number().nonnegative(), etaMin: z.number().int().positive().optional(), rule: z.record(z.unknown()).optional() }), req.body)));
export const patchZona = async (req: Request, res: Response) => res.json(await entregas.atualizarZona(String(req.params.id), parse(z.object({ name: z.string().optional(), fee: z.number().nonnegative().optional(), etaMin: z.number().int().positive().nullable().optional(), isActive: z.boolean().optional(), rule: z.record(z.unknown()).optional() }), req.body)));
export const getZonaPorCep = async (req: Request, res: Response) => res.json(await entregas.zonaPorCep(String(req.params.cep)));

// ── Cardápio ──
export const getMenus = async (_req: Request, res: Response) => res.json(await cardapio.listarMenus());
export const getMenu = async (req: Request, res: Response) => res.json(await cardapio.menuCompleto(String(req.params.id)));
export const postMenu = async (req: Request, res: Response) => res.status(201).json(await cardapio.criarMenu(parse(z.object({ name: z.string().min(1).max(80), slug: z.string().regex(/^[a-z0-9-]{2,60}$/), availability: z.array(z.record(z.unknown())).optional() }), req.body)));
export const patchMenu = async (req: Request, res: Response) => res.json(await cardapio.atualizarMenu(String(req.params.id), parse(z.object({ name: z.string().optional(), isPublished: z.boolean().optional(), availability: z.array(z.record(z.unknown())).optional() }), req.body)));
export const postCategoria = async (req: Request, res: Response) => res.status(201).json(await cardapio.criarCategoria(String(req.params.id), parse(z.object({ name: z.string().min(1).max(80), position: z.number().int().optional() }), req.body)));
export const postItem = async (req: Request, res: Response) => res.status(201).json(await cardapio.criarItem(String(req.params.id), parse(z.object({ categoryId: z.string().uuid().optional(), variantId: z.string().uuid(), displayName: z.string().min(1).max(120), description: z.string().optional(), price: z.number().nonnegative(), imageUrl: z.string().url().optional(), station: z.string().max(30).optional(), prepTimeMin: z.number().int().positive().optional(), position: z.number().int().optional() }), req.body)));
export const patchItem = async (req: Request, res: Response) => res.json(await cardapio.atualizarItem(String(req.params.itemId), parse(z.object({ categoryId: z.string().uuid().nullable().optional(), displayName: z.string().optional(), description: z.string().optional(), price: z.number().nonnegative().optional(), imageUrl: z.string().url().nullable().optional(), station: z.string().optional(), prepTimeMin: z.number().int().nullable().optional(), isAvailable: z.boolean().optional(), position: z.number().int().optional() }), req.body)));
export const getGrupos = async (_req: Request, res: Response) => res.json(await cardapio.listarGruposAdicionais());
export const postGrupo = async (req: Request, res: Response) => res.status(201).json(await cardapio.criarGrupoAdicionais(parse(z.object({ name: z.string().min(1), minSelect: z.number().int().nonnegative().optional(), maxSelect: z.number().int().positive().optional(), modifiers: z.array(z.object({ name: z.string().min(1), price: z.number().nonnegative().optional() })).optional() }), req.body)));
export const postLigarGrupo = async (req: Request, res: Response) => { const b = parse(z.object({ groupId: z.string().uuid(), position: z.number().int().optional() }), req.body); res.status(201).json(await cardapio.ligarGrupoAoItem(String(req.params.itemId), b.groupId, b.position)); };

// ── Relatórios ──
export const getRelItens = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.vendasPorItem(a, b)); };
export const getRelTipos = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.porTipoDeServico(a, b)); };
export const getRelHoras = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.movimentoPorHora(a, b)); };
export const getRelEntregadores = async (req: Request, res: Response) => { const [a, b] = faixa(parse(periodo, req.query)); res.json(await rel.desempenhoEntregadores(a, b)); };

// ── Público ──
export const getCardapioPublico = async (req: Request, res: Response) => res.json(await cardapio.cardapioPublico(String(req.params.tenant), String(req.params.menu)));
const pedidoOnlineSchema = z.object({
  menuSlug: z.string(), serviceType: z.enum(['DELIVERY', 'TAKEOUT']),
  cliente: z.object({ nome: z.string().min(2).max(120), telefone: z.string().min(8).max(20) }),
  endereco: z.object({ street: z.string().min(1), number: z.string().optional(), complement: z.string().optional(), district: z.string().optional(), city: z.string().min(1), state: z.string().length(2), zipCode: z.string().optional(), reference: z.string().optional() }).optional(),
  zoneId: z.string().uuid().optional(),
  itens: z.array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().positive().max(50), modifiers: z.array(z.object({ name: z.string(), price: z.number().nonnegative() })).optional(), obs: z.string().max(200).optional() })).min(1).max(50),
  observacoes: z.string().max(500).optional(), pagamentoNaEntrega: z.enum(['CASH', 'DEBIT', 'CREDIT', 'PIX']), trocoPara: z.number().positive().optional(),
});
export const postPedidoOnline = async (req: Request, res: Response) => res.status(201).json(await online.pedidoOnline(String(req.params.tenant), parse(pedidoOnlineSchema, req.body)));
export const getAcompanhar = async (req: Request, res: Response) => { const q = parse(z.object({ telefone: z.string().min(8) }), req.query); res.json(await online.acompanharPedido(String(req.params.tenant), Number(req.params.numero), q.telefone)); };
