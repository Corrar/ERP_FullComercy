// src/jobs/scheduler.ts — agendador em processo. Cada módulo declara `jobs` na sua definição;
// o core só roda. `JOBS_ENABLED=0` desliga tudo (instância só-API atrás de balanceador).
// Jitter no boot para N instâncias não varrerem o banco no mesmo segundo.
import { env } from '../config/env';

export interface JobDefinition {
  name: string;
  everyMs: number;
  /** Roda uma vez logo após o boot (com jitter)? Default true. */
  runOnBoot?: boolean;
  run: () => Promise<unknown>;
}

const timers: NodeJS.Timeout[] = [];
const running = new Set<string>();

async function tick(job: JobDefinition) {
  if (running.has(job.name)) { console.warn(`[job:${job.name}] ainda rodando; pulo este tick`); return; }
  running.add(job.name);
  const t0 = Date.now();
  try {
    const r = await job.run();
    console.log(`[job:${job.name}] ok em ${Date.now() - t0} ms`, r ?? '');
  } catch (e) {
    console.error(`[job:${job.name}] falhou:`, e instanceof Error ? e.message : e);
  } finally { running.delete(job.name); }
}

export function startJobs(jobs: JobDefinition[]) {
  if (!env.JOBS_ENABLED) { console.log('[jobs] desligados (JOBS_ENABLED=0)'); return; }
  for (const job of jobs) {
    const jitter = Math.floor(Math.random() * 30_000);
    if (job.runOnBoot !== false) timers.push(setTimeout(() => void tick(job), 5_000 + jitter));
    const t = setInterval(() => void tick(job), job.everyMs); t.unref(); timers.push(t);
    console.log(`[jobs] ${job.name} a cada ${Math.round(job.everyMs / 60_000)} min`);
  }
}

export function stopJobs() { for (const t of timers) clearTimeout(t); timers.length = 0; }
