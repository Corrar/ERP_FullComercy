// src/shared/paginacao.ts — paginação das listagens do núcleo, sem quebrar quem já consome a lista.
// Com `page` na query a resposta é `{ rows, page, pageSize, total }` (as telas de listagem);
// sem `page`, segue a lista simples até um teto (os seletores e buscas dos módulos usam essa).
import { z } from 'zod';

export const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type Paginacao = z.infer<typeof paginacaoSchema>;
export interface Pagina<T> { rows: T[]; page: number; pageSize: number; total: number }

export async function paginar<T>(p: Paginacao | undefined, tetoSemPagina: number, buscar: (skip: number, take: number) => Promise<T[]>, contar: () => Promise<number>): Promise<T[] | Pagina<T>> {
  if (!p?.page) return buscar(0, tetoSemPagina);
  const pageSize = p.pageSize ?? 50;
  const [rows, total] = await Promise.all([buscar((p.page - 1) * pageSize, pageSize), contar()]);
  return { rows, page: p.page, pageSize, total };
}
