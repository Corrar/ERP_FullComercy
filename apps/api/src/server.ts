import { createServer } from 'node:http';
import { env } from './config/env';
import { buildApp, corsOrigins } from './app';
import { prisma } from './infra/prisma';
import { initRealtime } from './infra/realtime';
import { startJobs, stopJobs } from './jobs/scheduler';
import { moduleRegistry } from './modules/module.registry';
import { coreJobs } from './jobs/core.jobs';

const app = buildApp();
const server = createServer(app);
initRealtime(server, corsOrigins());
startJobs([...coreJobs, ...moduleRegistry.allJobs()]);

server.listen(env.PORT, () => {
  console.log(`🚀 FullComercy API na porta ${env.PORT} (${env.NODE_ENV})`);
  // Acorda o banco antes do 1º usuário; falha aqui é log, não boot abortado.
  prisma.$queryRaw`SELECT 1`.then(() => console.log('[db] ok')).catch((e) => console.error('[db] warmup falhou:', e?.message ?? e));
});

const shutdown = (sig: string) => {
  console.log(`[${sig}] encerrando…`);
  stopJobs();
  server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
