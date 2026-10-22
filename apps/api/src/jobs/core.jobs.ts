// src/jobs/core.jobs.ts — jobs do núcleo (os de módulo ficam em cada `modules/*/index.ts`).
import type { JobDefinition } from './scheduler';
import { dispatchPending } from '../core/integration/outbox.service';
import { expirarIntencoes } from '../core/payments/payments.service';
import { runBillingCycle } from '../core/billing/billing.service';
import { aplicarModeloNasEmpresasAntigas } from '../core/rbac/role-templates';

export const coreJobs: JobDefinition[] = [
  { name: 'core.outbox-dispatch', everyMs: 60_000, run: () => dispatchPending() },
  { name: 'core.payments-expire', everyMs: 5 * 60_000, run: () => expirarIntencoes() },
  // Assinatura do SaaS: fim de teste, renovação, nova tentativa de cartão, atraso e suspensão.
  { name: 'core.billing-cycle', everyMs: 15 * 60_000, run: () => runBillingCycle() },
  // Perfis prontos nas empresas criadas antes do modelo: uma vez por empresa (marca em settings).
  { name: 'core.perfis-modelo', everyMs: 24 * 3_600_000, run: () => aplicarModeloNasEmpresasAntigas() },
];
