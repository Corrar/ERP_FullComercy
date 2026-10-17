// src/infra/prisma.ts — DOIS clients, UMA regra.
//
// • `prisma` (PLATAFORMA): login, refresh, onboarding, jobs que varrem tenants, snapshot de
//   módulos. Conecta com `DATABASE_ADMIN_URL`, um papel com BYPASSRLS (ou superuser). É o único
//   lugar que enxerga "todas as empresas", e por isso NUNCA aparece em código de negócio.
// • `ctx().db` (TENANT): o client sujeito ao RLS (`DATABASE_URL`, papel comum), estendido para
//   (1) injetar `tenantId` em todo `where`/`data` e (2) armar `app.tenant_id` ANTES de toda
//   operação. Dentro de `tenantTransaction` o GUC já está armado (SET LOCAL); fora dela, a
//   extensão embrulha a operação num LOTE `[set_config, operação]` — uma transação curta, sem
//   round-trip interativo. Assim NENHUMA query de negócio chega ao banco sem o tenant, e o RLS
//   em `prisma/sql/001_rls_tenant.sql` pode ser estrito (sem GUC = zero linhas, escrita recusada).
//
// Sem `DATABASE_ADMIN_URL` (dev com superuser), os dois clients são o mesmo processo de pool e o
// superuser atravessa o RLS — a regra 1 (filtro da aplicação) continua valendo. `TENANT_RLS=0`
// desliga o embrulho em lote quando o banco não tem RLS (menos round-trips).
//
// ⚠ A extensão é a REDE, não o caminho: o tipo gerado pelo Prisma continua exigindo `tenantId`
//   no `create` de topo (e o omite em `create` aninhado sob FK composta, porque herda do pai).
//   O código passa `tenantId` explicitamente; se passar o tenant ERRADO, o filtro de `where`
//   e o RLS não deixam ler nem gravar.
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env';

const log: Prisma.LogLevel[] = env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'];

/** PLATAFORMA — papel com BYPASSRLS. */
export const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_ADMIN_URL ?? env.DATABASE_URL, log });

/** TENANT — papel comum, sujeito ao RLS. Mesmo client quando não há separação. */
const rlsBase: PrismaClient = env.DATABASE_ADMIN_URL ? new PrismaClient({ datasourceUrl: env.DATABASE_URL, log }) : prisma;

/** Modelos SEM tenant_id: só o próprio Tenant. Qualquer modelo novo nasce escopado. */
const GLOBAL_MODELS = new Set<string>(['Tenant']);

const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy', 'upsert',
]);
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

function scopeArgs(args: any, tenantId: string, operation: string): any {
  const out = { ...(args ?? {}) };
  if (WHERE_OPS.has(operation)) out.where = { ...(out.where ?? {}), tenantId };
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

// ── "Estou dentro de uma tenantTransaction?" — por AsyncLocalStorage, para a extensão saber se
//    o GUC já foi armado por SET LOCAL ou se precisa embrulhar em lote.
// `tx` é OPACO aqui de propósito: tipá-lo como TenantTx criaria um ciclo (TenantTx ← TenantDb ←
// prismaForTenant ← txScope ← TxScope) que o TypeScript resolve inferindo `any` para o client
// inteiro, em silêncio — todo service perderia a tipagem. Medido: cinco erros de implicit-any.
interface TxScope { tenantId: string; tx: unknown }
const txScope = new AsyncLocalStorage<TxScope>();
const insideTenantTx = () => txScope.getStore() !== undefined;

/** O hook da extensão recebe `__internalParams.transaction` = { kind: 'itx' } quando a operação
 *  é do client de uma transação interativa. Não é API pública do Prisma; está coberto por teste
 *  (e2e: addItems) para gritar se uma versão nova mudar isso. */
const isItx = (params: unknown): boolean => (params as { __internalParams?: { transaction?: { kind?: string } } }).__internalParams?.transaction?.kind === 'itx';

const setGuc = (tenantId: string) => rlsBase.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Constrói o client escopado. Barato (reusa o engine) — pode ser por request. */
export function prismaForTenant(tenantId: string) {
  return rlsBase.$extends({
    name: `tenant:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // `arguments[0]` e não `...rest`: a desestruturação com rest quebra a inferência genérica
          // do Prisma (o resultado viraria `any` em todo service). Método, não arrow, de propósito.
          // eslint-disable-next-line prefer-rest-params
          const internals = arguments[0];
          if (GLOBAL_MODELS.has(model)) return query(args);
          const scoped = scopeArgs(args, tenantId, operation);
          if (!env.TENANT_RLS) return query(scoped);
          const scope = txScope.getStore();
          if (scope) {
            // Dentro de tenantTransaction. Se ESTE client é o da transação, segue (GUC já armado).
            // Se é o client de FORA usado por engano dentro dela (`ctx().db` num service chamado
            // pela transação), redireciona para a transação: na conexão de fora não há GUC e o
            // RLS devolveria VAZIO em silêncio — achado pelo e2e no addItems.
            if (isItx(internals)) return query(scoped);
            return (scope.tx as any)[lcFirst(model)][operation](scoped) as ReturnType<typeof query>;
          }
          // Fora de transação: lote [GUC, operação] no client BASE (não passa de novo por aqui).
          const delegate = (rlsBase as any)[lcFirst(model)];
          const [, result] = await rlsBase.$transaction([setGuc(tenantId), delegate[operation](scoped)]);
          return result as Awaited<ReturnType<typeof query>>;
        },
      },
      async $queryRaw({ args, query }) {
        // eslint-disable-next-line prefer-rest-params
        const internals = arguments[0];
        if (!env.TENANT_RLS) return query(args);
        const scope = txScope.getStore();
        if (scope) return isItx(internals) ? query(args) : ((scope.tx as any).$queryRaw(args) as ReturnType<typeof query>);
        const [, result] = await rlsBase.$transaction([setGuc(tenantId), rlsBase.$queryRaw(args as unknown as Prisma.Sql)]);
        return result as Awaited<ReturnType<typeof query>>;
      },
      async $executeRaw({ args, query }) {
        // eslint-disable-next-line prefer-rest-params
        const internals = arguments[0];
        if (!env.TENANT_RLS) return query(args);
        const scope = txScope.getStore();
        if (scope) return isItx(internals) ? query(args) : ((scope.tx as any).$executeRaw(args) as ReturnType<typeof query>);
        const [, result] = await rlsBase.$transaction([setGuc(tenantId), rlsBase.$executeRaw(args as unknown as Prisma.Sql)]);
        return result as Awaited<ReturnType<typeof query>>;
      },
    },
  });
}

export type TenantDb = ReturnType<typeof prismaForTenant>;
/** O client DENTRO de uma transação interativa (sem `$transaction`/`$connect`). */
export type TenantTx = Omit<TenantDb, '$transaction' | '$connect' | '$disconnect' | '$extends' | '$on' | '$use'>;

/**
 * Transação interativa com o RLS armado: `SET LOCAL app.tenant_id` vale só até o COMMIT.
 * Todo caminho de ESCRITA de negócio com mais de um passo passa por aqui. Chamada aninhada
 * reaproveita a transação de fora (mesmo tenant) em vez de abrir outra.
 */
export async function tenantTransaction<T>(
  db: TenantDb,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const outer = txScope.getStore();
  if (outer) {
    if (outer.tenantId !== tenantId) throw new Error('tenantTransaction aninhada com tenant diferente.');
    return fn(outer.tx as TenantTx);
  }
  return db.$transaction(
    async (tx) => {
      const scope: TxScope = { tenantId, tx };
      // O escopo entra ANTES do set_config: só assim o hook da extensão vê "estou na transação"
      // e manda o SET LOCAL para ESTA conexão, não para um lote à parte. (Achado pelo e2e: com a
      // ordem invertida o GUC ia para outra transação e o RLS recusava toda escrita raw.)
      return txScope.run(scope, async () => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return fn(tx as unknown as TenantTx);
      });
    },
    { timeout: opts?.timeoutMs ?? 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
