// src/core/platform/segredos.service.ts — rotação da APP_ENCRYPTION_KEY: onde ficam os segredos
// selados (shared/crypto.ts), em que chave cada um está e o job que regrava tudo na atual.
//
// É trabalho de PLATAFORMA (todas as empresas de uma vez), por isso usa o client base. Cada
// regravação é condicional ao valor lido: se a empresa trocou o segredo no meio (novo token da
// catraca), a troca dela vence e o job só pula a linha. Linha que nenhuma chave abre não para o
// resto — conta em `ilegiveis` e o status mostra.
import { prisma } from '../../infra/prisma';
import { cifra as cifraDoAmbiente, type Cifra } from '../../shared/crypto';

/** Credenciais da conta do Mercado Pago da empresa (`settings.payments.mercadopago`). */
const CAMPOS_MP = ['accessToken', 'webhookSecret'] as const;

/** Os lugares com segredo selado. Segredo novo no banco = uma entrada aqui. */
async function selados() {
  const hooks = await prisma.webhook.findMany({ select: { id: true, secret: true } });
  const devs = await prisma.gymAccessDevice.findMany({ select: { id: true, config: true } });
  const empresas = await prisma.tenant.findMany({ select: { id: true, settings: true } });
  return [
    ...empresas.flatMap((t) => {
      const mp = ((t.settings as { payments?: { mercadopago?: Record<string, unknown> } } | null)?.payments?.mercadopago ?? {});
      return CAMPOS_MP.flatMap((campo) => (typeof mp[campo] === 'string' ? [{ onde: 'mercadopago' as const, id: t.id, campo, selo: mp[campo] as string }] : []));
    }),
    ...hooks.map((h) => ({ onde: 'webhooks' as const, id: h.id, selo: h.secret })),
    ...devs.flatMap((d) => {
      const tok = (d.config as { webhookToken?: unknown } | null)?.webhookToken;
      return typeof tok === 'string' ? [{ onde: 'catracas' as const, id: d.id, selo: tok }] : [];
    }),
  ];
}

export async function statusDosSegredos(cifra: Cifra = cifraDoAmbiente) {
  const porChave: Record<string, number> = {};
  let ilegiveis = 0;
  for (const s of await selados()) {
    const k = cifra.chaveDo(s.selo);
    porChave[k] = (porChave[k] ?? 0) + 1;
    try { cifra.open(s.selo); } catch { ilegiveis++; }
  }
  const total = Object.values(porChave).reduce((a, b) => a + b, 0);
  const naAtual = cifra.kid ? porChave[cifra.kid] ?? 0 : 0;
  return { chaveAtual: cifra.kid, total, porChave, ilegiveis, pendentes: cifra.kid ? total - naAtual : 0 };
}

export async function recifrarSegredos(cifra: Cifra = cifraDoAmbiente) {
  if (!cifra.kid) return { recifrados: 0, ilegiveis: 0, mudaramNoMeio: 0 };
  let recifrados = 0, ilegiveis = 0, mudaramNoMeio = 0;
  for (const s of await selados()) {
    if (!cifra.precisaRecifrar(s.selo)) continue;
    let novo: string;
    try { novo = cifra.seal(cifra.open(s.selo)); } catch { ilegiveis++; continue; }
    const r = s.onde === 'webhooks'
      ? await prisma.webhook.updateMany({ where: { id: s.id, secret: s.selo }, data: { secret: novo } })
      : s.onde === 'mercadopago'
        ? await prisma.$executeRaw`UPDATE core_tenants SET settings = jsonb_set(settings, ARRAY['payments', 'mercadopago', ${s.campo}::text], to_jsonb(${novo}::text)), updated_at = now() WHERE id = ${s.id}::uuid AND settings->'payments'->'mercadopago'->>${s.campo}::text = ${s.selo}`
        : await prisma.$executeRaw`UPDATE gym_access_devices SET config = jsonb_set(config, '{webhookToken}', to_jsonb(${novo}::text)), updated_at = now() WHERE id = ${s.id}::uuid AND config->>'webhookToken' = ${s.selo}`;
    if ((typeof r === 'number' ? r : r.count) === 1) recifrados++; else mudaramNoMeio++;
  }
  return { recifrados, ilegiveis, mudaramNoMeio };
}
