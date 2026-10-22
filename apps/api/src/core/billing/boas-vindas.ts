// src/core/billing/boas-vindas.ts — o e-mail que chega logo depois da compra: o sistema está
// pronto, os DADOS DE ACESSO (endereço, identificador da empresa, e-mail de login), o que foi
// contratado e os perfis prontos da equipe. Senha NUNCA vai no e-mail: vai um link de uso único
// (72 h) para definir a senha — quem criou senha na conta já pode usar a mesma; quem entrou só com
// o Google ganha por ali uma senha para o acesso da equipe.
// Falha de envio não desfaz a compra (a sessão já foi entregue no checkout): loga e segue.
import { prisma } from '../../infra/prisma';
import { appUrl, sendMail } from '../../infra/mailer';
import { emailDaEmpresa, marcaDaEmpresa } from '../../infra/mail-templates';
import { issuePasswordToken } from '../auth/auth.service';
import type { ModuleKey } from '@prisma/client';
import { MODULE_OFFERS } from './catalog';

export interface DadosBoasVindas {
  tenantId: string; slug: string; adminUserId: string;
  nome: string; email: string; temSenha: boolean;
  modulos: ModuleKey[]; funcoes: string[]; total: string; trialAte: Date | null;
}

const data = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const reais = (v: string) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function enviarBoasVindas(d: DadosBoasVindas): Promise<boolean> {
  try {
    const token = await issuePasswordToken(d.tenantId, d.adminUserId, 'INVITE');
    const definir = appUrl(`/definir-senha?tenant=${encodeURIComponent(d.slug)}&token=${token}`);
    const entrar = appUrl(`/login?modo=funcionario&empresa=${encodeURIComponent(d.slug)}&email=${encodeURIComponent(d.email)}`);
    const marca = await marcaDaEmpresa(d.tenantId);
    const modulos = d.modulos.map((m) => MODULE_OFFERS.find((o) => o.key === m)?.name ?? m).join(', ');
    const funcoes = d.funcoes.join(', ');
    const perfis = await prisma.role.findMany({ where: { tenantId: d.tenantId, isSystem: false }, select: { name: true }, orderBy: { name: 'asc' } });

    await sendMail({ to: d.email, subject: `${marca.nome} · seu sistema está pronto (dados de acesso)`, ...emailDaEmpresa({
      marca, titulo: `Seu sistema está pronto, ${d.nome}`,
      paragrafos: [
        `A empresa ${marca.nome} foi criada com ${d.modulos.length > 1 ? 'os módulos' : 'o módulo'} ${modulos}. Funções contratadas: ${funcoes}.`,
        `Dados de acesso — endereço: ${entrar} · empresa: ${d.slug} · e-mail: ${d.email}. Você entra como administrador e vê exatamente o que foi contratado.`,
        d.temSenha
          ? 'Senha: a mesma que você criou no cadastro. Se preferir uma senha só para o sistema, defina pelo botão abaixo (o link vale por 72 horas e só funciona uma vez).'
          : 'Você se cadastrou com o Google e pode continuar entrando por ele. Para entrar também com e-mail e senha, defina a sua pelo botão abaixo (o link vale por 72 horas e só funciona uma vez).',
        d.trialAte ? `Teste grátis até ${data(d.trialAte)}; a primeira mensalidade (${reais(d.total)}) só é cobrada depois.` : `Mensalidade: ${reais(d.total)}.`,
        perfis.length ? `Perfis prontos para a sua equipe: ${perfis.map((p) => p.name).join(', ')}. Convide as pessoas em Usuários e escolha o perfil de cada uma.` : '',
      ].filter(Boolean),
      botao: { texto: 'Definir minha senha', url: definir },
      nota: 'Não compartilhe este e-mail: o link de senha é pessoal. Se você não fez esta compra, responda avisando.',
    }) });
    return true;
  } catch (e) {
    console.error('[boas-vindas] e-mail não enviado:', e instanceof Error ? e.message : e);
    return false;
  }
}
