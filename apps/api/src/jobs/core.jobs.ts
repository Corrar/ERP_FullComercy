// src/jobs/core.jobs.ts — jobs do núcleo (os de módulo ficam em cada `modules/*/index.ts`).
import type { JobDefinition } from './scheduler';
import { dispatchPending } from '../core/integration/outbox.service';
import { expirarIntencoes } from '../core/payments/payments.service';

export const coreJobs: JobDefinition[] = [
  { name: 'core.outbox-dispatch', everyMs: 60_000, run: () => dispatchPending() },
  { name: 'core.payments-expire', everyMs: 5 * 60_000, run: () => expirarIntencoes() },
];
