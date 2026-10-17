// src/infra/prisma.ts — UM PrismaClient base + um client "vestido" por tenant.
//
// A REGRA: código de negócio NUNCA usa `prisma` (o base) diretamente. Usa `ctx().db`, que é
// o base estendido com a injeção de `tenantId` em TODA operação de TODO modelo (menos Tenant).
//
// ⚠ A extensão é a REDE, não o caminho: o tipo gerado pelo Prisma continua exigindo `tenantId`
//   no `create` de topo (e o omite em `create` aninhado sob FK composta, porque herda do pai).
//   Então o código passa `tenantId` explicitamente onde o tipo pede — e se algum dia esquecer,
//   a extensão preenche; se passar o tenant ERRADO, o filtro de `where` e o RLS não deixam ler.
// O base fica exportado para três usos legítimos: login (ainda não há tenant), jobs de
// plataforma (varrem todos os tenants) e o seed.
//
// Duas camadas de isolamento, propositalmente redundantes:
//   1. Esta extensão (aplicação) — filtra/preenche `tenantId`.
//   2. RLS no Postgres (`prisma/sql/001_rls_tenant.sql`) — lê `app.tenant_id` setado por
//      `tenantTransaction()`. Se a camada 1 falhar por bug, a 2 devolve zero linhas em vez de
//      dados alheios.
import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

/** Modelos SEM tenant_id: só o próprio Tenant. Qualquer modelo novo nasce escopado. */
const GLOBAL_MODELS = new Set<string>(['Tenant']);

/** Operações cujo `args.where` deve receber o tenant. */
const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy', 'upsert',
]);
/** Operações cujo `args.data` recebe o tenant. */
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

function scopeArgs(args: any, tenantId: string, operation: string): any {
  const out = { ...(args ?? {}) };
  if (WHERE_OPS.has(operation)) {
    out.where = { ...(out.where ?? {}), tenantId };
  }
  if (CREATE_OPS.has(operation)) {
    if (operation === 'createMany' || operation === 'createManyAndReturn') {
      const rows = Array.isArray(out.data) ? out.data : [out.data];
      out.data = rows.map((r: any) => ({ ...r, tenantId }));
    } else if (operation === 'upsert') {
      out.create = { ...(out.create ?? {}), tenantId };
    } else {
      out.data = { ...(out.data ?? {}), tenantId };
    }
  }
  return out;
}

/** Constrói o client escopado. Barato (reusa o engine do base) — pode ser por request. */
export function prismaForTenant(tenantId: string) {
  return prisma.$extends({
    name: `tenant:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model)) return query(args);
          return query(scopeArgs(args, tenantId, operation));
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof prismaForTenant>;
/** O client DENTRO de uma transação interativa (sem `$transaction`/`$connect`). */
export type TenantTx = Omit<TenantDb, '$transaction' | '$connect' | '$disconnect' | '$extends' | '$on' | '$use'>;

/**
 * Transação interativa que também arma o RLS: `SET LOCAL app.tenant_id` vale só até o COMMIT.
 * Todo caminho de ESCRITA de negócio deve passar por aqui (pedido, estoque, financeiro).
 */
export async function tenantTransaction<T>(
  db: TenantDb,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as TenantTx);
    },
    { timeout: opts?.timeoutMs ?? 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
