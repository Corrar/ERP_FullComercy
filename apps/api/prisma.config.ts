// prisma.config.ts — substitui `package.json#prisma` (deprecado no Prisma 7).
// O CLI (migrate, studio, db seed) é tarefa de PLATAFORMA: usa a URL de administração, que
// atravessa o RLS e é dona de `_prisma_migrations`. O runtime escolhe a URL por client
// (src/infra/prisma.ts); o schema não precisa saber de nada disso.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'ts-node prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? '' },
});
