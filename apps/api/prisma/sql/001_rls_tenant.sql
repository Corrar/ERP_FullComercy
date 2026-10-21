-- prisma/sql/001_rls_tenant.sql — Row Level Security por tenant (DEFESA EM PROFUNDIDADE).
--
-- A aplicação já filtra por tenant_id (src/infra/prisma.ts). Este arquivo faz o BANCO filtrar
-- também: com RLS ligado, uma query sem `app.tenant_id` armado não vê linha nenhuma e não grava.
--
-- DOIS PAPÉIS DE BANCO (o modelo que a aplicação espera):
--   • papel da PLATAFORMA (`DATABASE_ADMIN_URL`): BYPASSRLS. Roda migrations e este script; é o
--     que faz login, onboarding e jobs.  Ex.: CREATE ROLE fc_platform LOGIN BYPASSRLS PASSWORD '…';
--   • papel do TENANT (`DATABASE_URL`): comum, SEM bypass. É o que o código de negócio usa.
--     Ex.: CREATE ROLE app_rw LOGIN PASSWORD '…';   ← troque o nome abaixo se usar outro.
--
-- COMO APLICAR: depois de `prisma migrate deploy`, como o papel da plataforma (ou superuser):
--     psql "$DATABASE_ADMIN_URL" -f prisma/sql/001_rls_tenant.sql
-- Idempotente: pode rodar após cada migration (tabela nova ganha a política).
--
-- COMO A APLICAÇÃO ARMA: `SELECT set_config('app.tenant_id', '<uuid>', true)` no início de cada
-- transação (`tenantTransaction`) ou, fora de transação, num lote junto da própria operação
-- (extensão do Prisma). `true` = local à transação: some no COMMIT/ROLLBACK, então uma conexão
-- do pool nunca carrega o tenant da request anterior.

\set app_role app_rw

-- 1. Privilégios do papel do tenant (tabelas e sequências atuais e futuras).
GRANT USAGE ON SCHEMA public TO :app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :app_role;
REVOKE ALL ON TABLE _prisma_migrations FROM :app_role;

-- 1b. Tabelas de PLATAFORMA (`plat_*`, sem tenant_id: conta do comprador, hash de senha). Não há
--     linha de tenant para a política filtrar, então o papel do tenant simplesmente não as toca.
--     O GRANT ALL acima as incluiu; aqui o privilégio sai. Tabela `plat_*` nova entra nesta lista
--     (statement simples, não bloco DO: o psql não expande `:app_role` dentro de $$).
REVOKE ALL ON TABLE plat_accounts FROM :app_role;

-- 2. A política, em toda tabela que tenha `tenant_id`.
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
    -- NULLIF: sem GUC, current_setting devolve '' (missing_ok=true) e o cast falharia; com NULLIF
    -- a comparação vira NULL -> nenhuma linha lida, nenhuma linha gravada. Fail-closed.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t.tbl);
  END LOOP;
END $$;

-- 3. Invariantes do estoque que o Prisma não expressa (CHECK). Idempotente.
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
