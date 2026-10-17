// src/infra/mailer.ts — e-mail transacional (redefinição de senha, convite, aviso).
// Provedor por ambiente: SMTP (nodemailer) quando `SMTP_HOST` existe; senão `console`, que só
// loga o assunto e o link — dev e teste não precisam de servidor de e-mail, e nada é "enviado".
// O conteúdo NUNCA inclui a senha de ninguém: só links com token de uso único.
import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface Mail { to: string; subject: string; text: string; html?: string }

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined })
  : null;

/** Últimos e-mails do provedor console (os testes leem daqui). */
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<{ provider: 'smtp' | 'console' }> {
  if (transport) {
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    return { provider: 'smtp' };
  }
  outbox.push(mail); if (outbox.length > 50) outbox.shift();
  console.log(`[mail:console] para ${mail.to} · ${mail.subject}\n${mail.text}`);
  return { provider: 'console' };
}

export const appUrl = (path: string) => `${env.APP_URL.replace(/\/$/, '')}${path}`;
