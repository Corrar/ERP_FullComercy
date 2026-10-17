-- prisma/sql/001_rls_tenant.sql — Row Level Security por tenant (DEFESA EM PROFUNDIDADE).
--
-- A aplicação já filtra por tenant_id (src/infra/prisma.ts). Este arquivo faz o BANCO filtrar
-- também: com RLS ligado, uma query sem `app.tenant_id` setado não vê linha nenhuma.
--
-- COMO APLICAR: depois do `prisma migrate deploy`, rodar este arquivo (idempotente) no banco.
-- O usuário da aplicação NÃO pode ser superuser nem dono das tabelas (dono ignora RLS por
-- padrão) — crie um role `app_rw` e dê GRANT nas tabelas; use FORCE ROW LEVEL SECURITY para
-- o dono também obedecer, se for o mesmo role.
--
-- COMO A APLICAÇÃO ARMA: `SELECT set_config('app.tenant_id', '<uuid>', true)` no início de
-- cada transação (`tenantTransaction`). O `true` = local à transação: some no COMMIT/ROLLBACK,
-- então uma conexão do pool nunca carrega o tenant da request anterior.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relkind = 'r'
       AND c.relname <> 'core_tenants'
       AND c.relname <> '_prisma_migrations'
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.tbl);
    -- NULLIF: sem GUC setado, current_setting devolve '' (missing_ok=true) e o cast falharia;
    -- com NULLIF a comparação vira NULL -> nenhuma linha. Fail-closed.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t.tbl);
  END LOOP;
END $$;

-- Invariantes do estoque que o Prisma não expressa (CHECK). Idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'core_stock_on_hand_nonneg') THEN
    ALTER TABLE core_stock_balances ADD CONSTRAINT core_stock_on_hand_nonneg CHECK (on_hand >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'core_stock_reserved_nonneg') THEN
    ALTER TABLE core_stock_balances ADD CONSTRAINT core_stock_reserved_nonneg CHECK (reserved >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'core_stock_reserved_le_on_hand') THEN
    ALTER TABLE core_stock_balances ADD CONSTRAINT core_stock_reserved_le_on_hand CHECK (reserved <= on_hand);
  END IF;
END $$;
