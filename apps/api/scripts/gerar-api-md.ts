// scripts/gerar-api-md.ts — gera docs/API.md a partir das rotas REALMENTE montadas.
// Documentação que nasce do código não envelhece: `npm run docs:api` depois de mexer em rota.
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
process.env.JWT_SECRET ??= '0123456789abcdef0123456789abcdef';
process.env.PLATFORM_API_KEY ??= '0123456789abcdef0123456789abcdef';
import { buildApp, MOUNTED_ROUTES } from '../src/app';
import { allPermissions } from '../src/core/rbac/permissions';
import { moduleRegistry } from '../src/modules/module.registry';

buildApp();
const grupos: Record<string, typeof MOUNTED_ROUTES> = {};
for (const r of MOUNTED_ROUTES) { const g = r.auth === 'module' ? `Módulo ${r.module}` : r.auth === 'public' ? 'Público' : r.auth === 'platform' ? 'Plataforma (x-platform-key)' : `Core · ${r.path.split('/')[1]}`; (grupos[g] ??= []).push(r); }
const ordem = (g: string) => g.startsWith('Público') ? 0 : g.startsWith('Plataforma') ? 1 : g.startsWith('Core') ? 2 : 3;
let md = `# API — FullComercy\n\n> Gerado por \`npm run docs:api\` em ${new Date().toISOString().slice(0, 10)}. ${MOUNTED_ROUTES.length} rotas.\n\n`;
md += `Autenticação: rotas **Core** e de **Módulo** exigem \`Authorization: Bearer <access token>\`; as de módulo exigem ainda o módulo ATIVO na empresa (403 \`MODULE_INACTIVE\`). A coluna *permissão* é a chave que \`requirePermission\` cobra (perfil \`admin\` passa em todas). Vazio = qualquer usuário logado.\n\n`;
for (const g of Object.keys(grupos).sort((a, b) => ordem(a) - ordem(b) || a.localeCompare(b))) {
  md += `## ${g}\n\n| Método | Rota | Permissão |\n|---|---|---|\n`;
  for (const r of grupos[g]) md += `| \`${r.method}\` | \`${r.path}\` | ${r.permission ? `\`${r.permission}\`` : ''} |\n`;
  md += '\n';
}
md += `## Catálogo de permissões (${allPermissions().length})\n\n| Chave | Descrição | Módulo |\n|---|---|---|\n`;
for (const p of allPermissions()) md += `| \`${p.key}\` | ${p.label} | ${p.module ?? 'core'} |\n`;
md += `\n## Jobs\n\n| Nome | Intervalo |\n|---|---|\n| core.outbox-dispatch | 1 min |\n| core.payments-expire | 5 min |\n`;
for (const j of moduleRegistry.allJobs()) md += `| ${j.name} | ${Math.round(j.everyMs / 60_000)} min |\n`;
md += `\n## Eventos (webhooks / Socket.IO)\n\n\`order.created\`, \`order.status\`, \`order.paid\`, \`stock.low\`, \`kitchen.ticket\`, \`delivery.status\`, \`gym.access\`, \`os.status\`, \`purchase.received\`, \`payment.paid\`.\n\nWebhook: POST JSON \`{ id, type, occurredAt, tenantId, data }\` com \`X-FC-Signature: sha256=<HMAC-SHA256 do corpo com o segredo>\`, \`X-FC-Event\`, \`X-FC-Event-Id\`. Retry com backoff (1m, 5m, 30m, 2h, 12h).\n`;
writeFileSync('docs/API.md', md);
console.log(`docs/API.md: ${MOUNTED_ROUTES.length} rotas`);
process.exit(0);
