// src/shared/http.ts — cola entre Express e o resto: asyncHandler, validação e tradução de erro.
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, ZodTypeAny } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from './errors';
import { isProd } from '../config/env';

/** Envolve um handler async para que `throw` caia no error middleware (Express 5 já faz isso
 *  para Promises rejeitadas, mas o wrapper deixa a intenção explícita e tipa o retorno). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Valida e TIPA a entrada. Erro de schema vira 400 com os campos — nunca 500. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw AppError.validation('Dados inválidos.', r.error.flatten().fieldErrors);
  }
  return r.data;
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Rota não encontrada.', code: 'NOT_FOUND' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  // Corpo recusado pelo leitor do Express (JSON quebrado, arquivo grande demais): erro do cliente, não 500.
  const tipo = (err as { type?: string } | null)?.type;
  if (tipo === 'entity.too.large') return res.status(413).json({ error: 'Arquivo ou corpo grande demais.', code: 'PAYLOAD_TOO_LARGE' });
  if (tipo === 'entity.parse.failed') return res.status(400).json({ error: 'Corpo da requisição inválido (JSON).', code: 'VALIDATION' });
  // Erros conhecidos do Prisma viram respostas legíveis em vez de 500 opaco.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Registro duplicado.', code: 'CONFLICT', details: err.meta });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ error: 'Registro em uso por outro cadastro.', code: 'CONFLICT' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Registro não encontrado.', code: 'NOT_FOUND' });
    }
  }
  console.error('[erro não tratado]', err);
  return res.status(500).json({
    error: 'Erro interno.',
    code: 'INTERNAL',
    ...(isProd ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
}
