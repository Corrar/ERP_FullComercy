// src/core/inventory/stock.service.ts — O MOTOR ÚNICO DE ESTOQUE do core.
// Grão: (variante, armazém). Toda alteração de saldo passa por aqui, SEMPRE dentro de uma
// transação que o chamador abriu (`tenantTransaction`), e sempre nesta ordem:
//   1) trava a linha do grão (FOR UPDATE), criando-a se não existir;
//   2) valida o invariante DENTRO da trava (onHand >= 0, reserved <= onHand);
//   3) escreve a projeção e o razão imutável no MESMO commit;
//   4) idempotência por chave: o mesmo movimento reenviado não aplica duas vezes.
//
// Os módulos NÃO reimplementam estoque. O PDV do Varejo, a cozinha do Food (baixa de insumo) e
// a OS da oficina (baixa de peça) chamam `consume`/`reserve`/`release` daqui, cada um com o
// seu `refType`. É assim que o estoque continua "central" mesmo com quatro nichos em cima.
import { Prisma, StockMovementKind } from '@prisma/client';
import type { TenantTx } from '../../infra/prisma';
import { AppError } from '../../shared/errors';
import { D } from '../../shared/money';

export interface StockRef {
  refType: string;          // 'ORDER' | 'OS' | 'INVENTORY' | 'TRANSFER' …
  refId?: string | null;
  userId?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
  unitCost?: Prisma.Decimal | null;
}

interface Grain { tenantId: string; variantId: string; warehouseId: string }
interface Balance { id: string; onHand: Prisma.Decimal; reserved: Prisma.Decimal }

async function lock(tx: TenantTx, g: Grain): Promise<Balance> {
  // A linha nasce preguiçosa (não se cria N×M linhas vazias no cadastro).
  await tx.$executeRaw`
    INSERT INTO core_stock_balances (id, tenant_id, variant_id, warehouse_id, on_hand, reserved, updated_at)
    VALUES (gen_random_uuid(), ${g.tenantId}::uuid, ${g.variantId}::uuid, ${g.warehouseId}::uuid, 0, 0, now())
    ON CONFLICT (tenant_id, variant_id, warehouse_id) DO NOTHING`;
  const rows = await tx.$queryRaw<{ id: string; on_hand: Prisma.Decimal; reserved: Prisma.Decimal }[]>`
    SELECT id, on_hand, reserved FROM core_stock_balances
     WHERE tenant_id = ${g.tenantId}::uuid AND variant_id = ${g.variantId}::uuid AND warehouse_id = ${g.warehouseId}::uuid
     FOR UPDATE`;
  const r = rows[0];
  return { id: r.id, onHand: D(r.on_hand), reserved: D(r.reserved) };
}

async function alreadyApplied(tx: TenantTx, tenantId: string, key?: string | null): Promise<boolean> {
  if (!key) return false;
  const n = await tx.stockMovement.count({ where: { tenantId, idempotencyKey: key } });
  return n > 0;
}

async function persist(
  tx: TenantTx, g: Grain, bal: Balance, kind: StockMovementKind,
  dOnHand: Prisma.Decimal, dReserved: Prisma.Decimal, ref: StockRef,
) {
  const next = { onHand: bal.onHand.plus(dOnHand), reserved: bal.reserved.plus(dReserved) };
  if (next.onHand.lt(0)) {
    throw new AppError('STOCK_INSUFFICIENT', 'Saldo insuficiente em estoque.', { ...g, onHand: bal.onHand, pedido: dOnHand.neg() });
  }
  if (next.reserved.lt(0) || next.reserved.gt(next.onHand)) {
    throw new AppError('STOCK_INSUFFICIENT', 'Reserva inconsistente com o saldo.', { ...g, ...next });
  }
  await tx.stockBalance.update({ where: { id: bal.id }, data: next });
  await tx.stockMovement.create({
    data: {
      tenantId: g.tenantId, variantId: g.variantId, warehouseId: g.warehouseId, kind,
      deltaOnHand: dOnHand, deltaReserved: dReserved,
      refType: ref.refType, refId: ref.refId ?? null, userId: ref.userId ?? null,
      note: ref.note ?? null, idempotencyKey: ref.idempotencyKey ?? null, unitCost: ref.unitCost ?? null,
    },
  });
  return next;
}

const assertQty = (q: Prisma.Decimal) => {
  if (!q.isFinite() || q.lte(0)) throw AppError.validation(`Quantidade inválida (${q}).`);
};

/** Entrada (compra, produção, ajuste positivo de inventário). */
export async function receive(tx: TenantTx, g: Grain, qty: Prisma.Decimal, ref: StockRef) {
  assertQty(qty);
  if (await alreadyApplied(tx, g.tenantId, ref.idempotencyKey)) return null;
  return persist(tx, g, await lock(tx, g), StockMovementKind.RECEIVE, qty, D(0), ref);
}

/** Reserva (pedido aberto que ainda não saiu: comanda, OS aguardando aprovação). */
export async function reserve(tx: TenantTx, g: Grain, qty: Prisma.Decimal, ref: StockRef) {
  assertQty(qty);
  if (await alreadyApplied(tx, g.tenantId, ref.idempotencyKey)) return null;
  const bal = await lock(tx, g);
  if (bal.onHand.minus(bal.reserved).lt(qty)) {
    throw new AppError('STOCK_INSUFFICIENT', 'Sem saldo disponível para reservar.', { ...g, disponivel: bal.onHand.minus(bal.reserved) });
  }
  return persist(tx, g, bal, StockMovementKind.RESERVE, D(0), qty, ref);
}

/** Libera reserva (pedido cancelado). */
export async function release(tx: TenantTx, g: Grain, qty: Prisma.Decimal, ref: StockRef) {
  assertQty(qty);
  if (await alreadyApplied(tx, g.tenantId, ref.idempotencyKey)) return null;
  return persist(tx, g, await lock(tx, g), StockMovementKind.RELEASE, D(0), qty.neg(), ref);
}

/** Saída definitiva. `fromReserved=true` consome o que estava reservado; `false` tira direto. */
export async function consume(tx: TenantTx, g: Grain, qty: Prisma.Decimal, ref: StockRef, fromReserved = false) {
  assertQty(qty);
  if (await alreadyApplied(tx, g.tenantId, ref.idempotencyKey)) return null;
  const bal = await lock(tx, g);
  if (!fromReserved && bal.onHand.minus(bal.reserved).lt(qty)) {
    throw new AppError('STOCK_INSUFFICIENT', 'Sem saldo disponível.', { ...g, disponivel: bal.onHand.minus(bal.reserved) });
  }
  return persist(tx, g, bal, StockMovementKind.CONSUME, qty.neg(), fromReserved ? qty.neg() : D(0), ref);
}

/** Ajuste de inventário: leva o saldo físico para `newOnHand` e registra o delta. */
export async function adjustTo(tx: TenantTx, g: Grain, newOnHand: Prisma.Decimal, ref: StockRef) {
  if (await alreadyApplied(tx, g.tenantId, ref.idempotencyKey)) return null;
  const bal = await lock(tx, g);
  const delta = newOnHand.minus(bal.onHand);
  if (delta.isZero()) return { onHand: bal.onHand, reserved: bal.reserved };
  return persist(tx, g, bal, StockMovementKind.ADJUST, delta, D(0), ref);
}

/** Transferência entre armazéns: duas linhas travadas em ordem determinística (sem deadlock). */
export async function transfer(tx: TenantTx, from: Grain, toWarehouseId: string, qty: Prisma.Decimal, ref: StockRef) {
  assertQty(qty);
  if (await alreadyApplied(tx, from.tenantId, ref.idempotencyKey)) return null;
  const to: Grain = { ...from, warehouseId: toWarehouseId };
  const [a, b] = [from, to].sort((x, y) => x.warehouseId.localeCompare(y.warehouseId));
  const balA = await lock(tx, a);
  const balB = await lock(tx, b);
  const balFrom = a === from ? balA : balB;
  const balTo = a === from ? balB : balA;
  if (balFrom.onHand.minus(balFrom.reserved).lt(qty)) {
    throw new AppError('STOCK_INSUFFICIENT', 'Sem saldo disponível para transferir.', from);
  }
  const outKey = ref.idempotencyKey ? `${ref.idempotencyKey}:out` : null;
  const inKey = ref.idempotencyKey ? `${ref.idempotencyKey}:in` : null;
  await persist(tx, from, balFrom, StockMovementKind.TRANSFER_OUT, qty.neg(), D(0), { ...ref, idempotencyKey: outKey });
  return persist(tx, to, balTo, StockMovementKind.TRANSFER_IN, qty, D(0), { ...ref, idempotencyKey: inKey });
}
