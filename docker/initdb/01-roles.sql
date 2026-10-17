-- Papéis do modelo de dois clients. Senhas de DESENVOLVIMENTO: em produção, crie os papéis à mão.
-- fc_platform (dono do banco, criado pela imagem) atravessa o RLS; app_rw é o papel do tenant.
ALTER ROLE fc_platform BYPASSRLS;
CREATE ROLE app_rw LOGIN PASSWORD 'app_rw_dev' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE fullcomercy TO app_rw;
\connect fullcomercy
GRANT USAGE ON SCHEMA public TO app_rw;
