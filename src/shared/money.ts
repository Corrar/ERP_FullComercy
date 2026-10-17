// src/shared/money.ts — aritmética de dinheiro SEM Float. Tudo passa por Prisma.Decimal.
import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;
export const D = (v: Prisma.Decimal.Value): Prisma.Decimal => new Prisma.Decimal(v);
export const ZERO = D(0);

/** Arredonda para 2 casas (meio para cima), que é o que a nota fiscal espera. */
export const round2 = (v: Prisma.Decimal): Prisma.Decimal =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const sum = (vs: Prisma.Decimal[]): Prisma.Decimal => vs.reduce((a, b) => a.plus(b), ZERO);
