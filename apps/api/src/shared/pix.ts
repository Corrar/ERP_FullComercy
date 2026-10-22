// src/shared/pix.ts — Pix "copia e cola" (BR Code do Banco Central, padrão EMV MPM) gerado a
// partir da CHAVE Pix da empresa, já com o valor. É o Pix estático com valor: o cliente paga no app
// do banco dele e o dinheiro cai direto na conta da empresa, sem gateway no meio. A confirmação é
// do operador (provedor `manual`), porque o banco não avisa ninguém. Com um PSP (Pix dinâmico com
// webhook), entra outro provedor em core/payments/providers.
//
// Campo = ID (2 dígitos) + tamanho (2 dígitos) + valor. CRC16-CCITT (0x1021, início 0xFFFF) no fim.

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** CRC16/CCITT-FALSE, em 4 hex maiúsculos (o que o BR Code exige). */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Nome e cidade do recebedor: sem acento e no tamanho do padrão (25 e 15). */
const limpar = (s: string, max: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-]/g, '').trim().slice(0, max);

/** A chave como o Banco Central espera: CPF/CNPJ só dígitos, celular +55…, e-mail minúsculo, aleatória (EVP). */
export function normalizarChavePix(bruta: string): string | null {
  const s = bruta.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 77) return s.toLowerCase();
  const dig = s.replace(/\D/g, '');
  if (s.startsWith('+')) return dig.length >= 12 && dig.length <= 13 ? `+${dig}` : null;
  if (/^[\d.\-/ ]+$/.test(s) && (dig.length === 11 || dig.length === 14)) return dig; // CPF ou CNPJ
  return null;
}

export interface PixEstatico { chave: string; nome: string; cidade: string; valor: string; txid?: string; descricao?: string }

export function brCodePix(p: PixEstatico): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', p.chave) + (p.descricao ? campo('02', limpar(p.descricao, 40)) : '');
  // txid do Pix estático: só letras e números, até 25; "***" = sem identificador.
  const txid = (p.txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const corpo = campo('00', '01')
    + campo('26', conta)
    + campo('52', '0000')
    + campo('53', '986')
    + (Number(p.valor) > 0 ? campo('54', Number(p.valor).toFixed(2)) : '')
    + campo('58', 'BR')
    + campo('59', limpar(p.nome, 25) || 'RECEBEDOR')
    + campo('60', limpar(p.cidade, 15) || 'BRASIL')
    + campo('62', campo('05', txid))
    + '6304';
  return corpo + crc16(corpo);
}
