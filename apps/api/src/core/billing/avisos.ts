// src/core/billing/avisos.ts — os e-mails que a COBRANÇA manda a quem paga a assinatura (a conta
// do comprador): o teste grátis acabando, pagamento recebido, fatura para pagar (boleto/Pix),
// pagamento recusado e acesso suspenso. Sem isso o cliente só descobre o problema quando o
// sistema trava.
//
// • Uma vez só: cada aviso é registrado em `core_billing_notices` por (tipo, referência) ANTES do
//   envio. O ciclo e o webhook passam pelo mesmo fato (o pagamento é confirmado pela resposta da
//   cobrança e de novo pelo webhook) e o job pode rodar em mais de uma instância.
// • Nunca derruba a cobrança: falha de envio apaga o registro (a próxima passada tenta de novo) e
//   vai para o log. Aviso é consequência do fato, não condição dele.
// • Marca da PLATAFORMA: quem cobra é o ERP, não a empresa do cliente. O botão leva à Minha conta,
//   onde estão a assinatura, as faturas e a entrada no sistema (que fica aberto para pagar mesmo
//   suspenso).
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../infra/prisma';
import { appUrl, sendMail } from '../../infra/mailer';
import { emailDaEmpresa, marcaDaPlataforma } from '../../infra/mail-templates';
import { addDays } from './periods';

export type TipoAviso = 'teste_acabando' | 'pagamento_recebido' | 'fatura_aberta' | 'pagamento_recusado' | 'suspensa';

/** Mesmo número do ciclo (`billing.service`): última tentativa automática no cartão. */
export const CARD_MAX_ATTEMPTS = 4;

const data = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const reais = (v: Prisma.Decimal | string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MEIO: Record<string, string> = { CARD: 'cartão de crédito', BOLETO: 'boleto', PIX_AUTO: 'Pix Automático' };

type Sub = Prisma.SubscriptionGetPayload<{ include: { tenant: true; account: true } }>;
type Fatura = Prisma.InvoiceGetPayload<object>;

/** "no cartão Visa final 4242" / "por boleto" / "pelo Pix Automático". */
function comoCobra(sub: Sub): string {
  const info = (sub.paymentInfo ?? {}) as { brand?: string; last4?: string };
  if (sub.method === 'CARD') return info.last4 ? `no cartão ${info.brand ? `${info.brand.toUpperCase()} ` : ''}final ${info.last4}` : 'no cartão cadastrado';
  return sub.method === 'BOLETO' ? 'por boleto' : 'pelo Pix Automático';
}

interface Conteudo { assunto: string; titulo: string; paragrafos: string[]; botao?: { texto: string; url: string } }

async function avisar(sub: Sub, tipo: TipoAviso, ref: string, c: Conteudo): Promise<boolean> {
  const para = sub.account.email;
  try {
    await prisma.billingNotice.create({ data: { tenantId: sub.tenantId, subscriptionId: sub.id, kind: tipo, ref, sentTo: para } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false; // já avisado
    console.error(`[avisos] ${tipo} não registrado:`, e instanceof Error ? e.message : e);
    return false;
  }
  try {
    const marca = marcaDaPlataforma();
    await sendMail({ to: para, subject: `${sub.tenant.name}: ${c.assunto}`, ...emailDaEmpresa({
      marca, titulo: c.titulo, paragrafos: c.paragrafos,
      botao: c.botao ?? { texto: 'Ver assinatura e faturas', url: appUrl('/minha-conta') },
      nota: `Você recebe este aviso porque a assinatura de ${sub.tenant.name} está na sua conta (${para}).`,
    }) });
    return true;
  } catch (e) {
    await prisma.billingNotice.deleteMany({ where: { tenantId: sub.tenantId, kind: tipo, ref } }).catch(() => {});
    console.error(`[avisos] ${tipo} não enviado:`, e instanceof Error ? e.message : e);
    return false;
  }
}

const carregar = (subscriptionId: string) => prisma.subscription.findUnique({ where: { id: subscriptionId }, include: { tenant: true, account: true } });

/** Dois dias antes do fim do teste: quando, quanto e por onde vai ser a primeira cobrança. */
export async function avisarTesteAcabando(subscriptionId: string) {
  const sub = await carregar(subscriptionId);
  if (!sub || sub.status !== 'TRIALING' || sub.cancelAtPeriodEnd) return false;
  const fim = sub.currentPeriodEnd;
  return avisar(sub, 'teste_acabando', fim.toISOString(), {
    assunto: `o teste grátis termina em ${data(fim)}`,
    titulo: 'Seu teste grátis está acabando',
    paragrafos: [
      `O teste grátis de ${sub.tenant.name} termina em ${data(fim)}. A partir daí a assinatura continua sozinha, sem você precisar fazer nada.`,
      sub.method === 'BOLETO'
        ? `Nesse dia geramos o boleto da primeira mensalidade, de ${reais(sub.amount)}, com vencimento em alguns dias. Ele chega por e-mail e fica na sua conta.`
        : `A primeira mensalidade, de ${reais(sub.amount)}, será cobrada ${comoCobra(sub)} nesse dia.`,
      'Quer mudar alguma função, trocar a forma de pagamento ou cancelar antes da cobrança? É pela sua conta, a qualquer momento.',
    ],
    botao: { texto: 'Revisar minha assinatura', url: appUrl('/minha-conta') },
  });
}

/** Fatura paga (pela cobrança, pelo webhook ou pelo "pagar agora"). `reativou`: a empresa estava suspensa. */
export async function avisarPagamentoRecebido(inv: Fatura, reativou: boolean) {
  const sub = await carregar(inv.subscriptionId);
  if (!sub) return false;
  return avisar(sub, 'pagamento_recebido', inv.id, {
    assunto: `pagamento de ${reais(inv.amount)} recebido`,
    titulo: 'Pagamento recebido',
    paragrafos: [
      `Recebemos ${reais(inv.amount)} ${inv.method === sub.method ? comoCobra(sub) : `por ${MEIO[inv.method] ?? 'pagamento'}`}, referente à mensalidade de ${sub.tenant.name} de ${data(inv.periodStart)} a ${data(inv.periodEnd)}.`,
      reativou ? 'O acesso ao sistema foi liberado de novo para toda a equipe.' : 'Nada a fazer: é só um comprovante.',
    ],
  });
}

/** Boleto (ou Pix com código) gerado: o que pagar e até quando. Cartão e Pix Automático debitam sozinhos. */
export async function avisarFaturaAberta(inv: Fatura) {
  if (inv.status !== 'OPEN' || !(inv.boletoLine || inv.boletoUrl || inv.pixCode)) return false;
  const sub = await carregar(inv.subscriptionId);
  if (!sub) return false;
  const https = inv.boletoUrl && /^https:\/\//.test(inv.boletoUrl) ? inv.boletoUrl : null;
  return avisar(sub, 'fatura_aberta', inv.id, {
    assunto: `fatura de ${reais(inv.amount)} vence em ${data(inv.dueAt)}`,
    titulo: 'Sua fatura está disponível',
    paragrafos: [
      `A mensalidade de ${sub.tenant.name} (${data(inv.periodStart)} a ${data(inv.periodEnd)}) é de ${reais(inv.amount)} e vence em ${data(inv.dueAt)}.`,
      inv.boletoLine ? `Linha digitável do boleto: ${inv.boletoLine}` : '',
      inv.pixCode ? `Pix copia e cola: ${inv.pixCode}` : '',
      'O pagamento é reconhecido sozinho; você recebe o comprovante por e-mail.',
    ].filter(Boolean),
    botao: https ? { texto: 'Abrir o boleto', url: https } : undefined,
  });
}

/**
 * Cobrança recusada. Avisa na PRIMEIRA recusa da fatura (ainda dá tempo) e na ÚLTIMA tentativa
 * automática do cartão (agora só a pessoa resolve) — não a cada tentativa, que viraria spam.
 */
export async function avisarPagamentoRecusado(inv: Fatura) {
  if (inv.status !== 'FAILED') return false;
  const ultima = inv.method === 'CARD' && inv.attempts >= CARD_MAX_ATTEMPTS;
  if (inv.attempts > 1 && !ultima) return false;
  const sub = await carregar(inv.subscriptionId);
  if (!sub) return false;
  const suspendeEm = addDays(inv.dueAt, env.BILLING_GRACE_DAYS);
  return avisar(sub, 'pagamento_recusado', `${inv.id}:${ultima ? 'ultima' : 'primeira'}`, {
    assunto: ultima ? 'última tentativa de cobrança recusada' : 'não conseguimos cobrar a mensalidade',
    titulo: ultima ? 'A cobrança continua sendo recusada' : 'Não conseguimos cobrar a mensalidade',
    paragrafos: [
      `A mensalidade de ${sub.tenant.name}, de ${reais(inv.amount)}, não foi paga ${comoCobra(sub)}. Motivo informado: ${inv.failureReason ?? 'pagamento recusado'}.`,
      inv.method === 'CARD' && !ultima
        ? 'Vamos tentar de novo automaticamente nos próximos dias. Se o cartão mudou ou está sem limite, atualize a forma de pagamento para não depender da próxima tentativa.'
        : 'As tentativas automáticas acabaram: atualize a forma de pagamento ou pague a fatura pela sua conta.',
      `Se a fatura não for paga até ${data(suspendeEm)}, o acesso ao sistema é suspenso para toda a equipe (os dados ficam guardados).`,
    ],
    botao: { texto: 'Atualizar forma de pagamento', url: appUrl('/minha-conta') },
  });
}

/** Empresa suspensa pela cobrança: o que acontece com os dados e como voltar. */
export async function avisarSuspensa(subscriptionId: string) {
  const sub = await carregar(subscriptionId);
  if (!sub?.pastDueSince) return false;
  return avisar(sub, 'suspensa', sub.pastDueSince.toISOString(), {
    assunto: 'acesso suspenso por falta de pagamento',
    titulo: 'O acesso ao sistema foi suspenso',
    paragrafos: [
      `A mensalidade de ${sub.tenant.name} está em aberto desde ${data(sub.pastDueSince)} e o prazo para pagamento terminou. Por isso o acesso ao sistema foi suspenso para toda a equipe.`,
      'Nenhum dado foi apagado: produtos, clientes, vendas e financeiro continuam guardados.',
      'Assim que a fatura for paga, o acesso volta na hora. Dá para pagar ou trocar a forma de pagamento pela sua conta.',
    ],
    botao: { texto: 'Regularizar agora', url: appUrl('/minha-conta') },
  });
}
