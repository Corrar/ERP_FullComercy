import { Request, Response } from 'express';
import { HotRoomStatus } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../../../shared/http';
import * as hot from '../services/hotel.service';

const id = (req: Request) => String(req.params.id);
const quarto = z.object({ number: z.string().min(1).max(10), type: z.string().min(2).max(40), capacity: z.number().int().min(1).max(20), dailyRate: z.number().positive(), notes: z.string().max(500).optional() });

export const getQuartos = async (_req: Request, res: Response) => res.json(await hot.quartos());
export const postQuarto = async (req: Request, res: Response) => res.status(201).json(await hot.criarQuarto(parse(quarto, req.body)));
export const patchQuarto = async (req: Request, res: Response) => res.json(await hot.atualizarQuarto(id(req), parse(quarto.partial().extend({ isActive: z.boolean().optional() }), req.body)));
export const postStatusQuarto = async (req: Request, res: Response) => res.json(await hot.statusDoQuarto(id(req), parse(z.object({ status: z.nativeEnum(HotRoomStatus) }), req.body).status));

export const getReservas = async (req: Request, res: Response) => { const q = parse(z.object({ from: z.coerce.date(), to: z.coerce.date() }), req.query); res.json(await hot.reservas(q.from, q.to)); };
export const postReserva = async (req: Request, res: Response) => res.status(201).json(await hot.reservar(parse(z.object({ customerId: z.string().uuid(), roomId: z.string().uuid(), checkIn: z.coerce.date(), checkOut: z.coerce.date(), guests: z.number().int().min(1).max(20).optional(), dailyRate: z.number().positive().optional(), source: z.string().max(30).optional(), notes: z.string().max(500).optional() }), req.body)));
export const patchReserva = async (req: Request, res: Response) => res.json(await hot.atualizarReserva(id(req), parse(z.object({ checkIn: z.coerce.date().optional(), checkOut: z.coerce.date().optional(), roomId: z.string().uuid().optional(), guests: z.number().int().min(1).max(20).optional(), status: z.enum(['CANCELLED', 'NO_SHOW', 'BOOKED']).optional(), notes: z.string().max(500).optional() }), req.body)));
export const postCheckout = async (req: Request, res: Response) => res.json(await hot.checkout(id(req)));
export const getDisponiveis = async (req: Request, res: Response) => { const q = parse(z.object({ checkIn: z.coerce.date(), checkOut: z.coerce.date(), guests: z.coerce.number().int().min(1).optional() }), req.query); res.json(await hot.disponiveis(q.checkIn, q.checkOut, q.guests)); };
export const getPainel = async (_req: Request, res: Response) => res.json(await hot.painel());
export const getOcupacao = async (req: Request, res: Response) => {
  const q = parse(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }), req.query);
  const ini = q.from ?? new Date(new Date().setDate(1)); const fim = q.to ?? new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
  res.json(await hot.ocupacao(ini, fim));
};
