// src/core/billing/periods.ts — contas de calendário e documento da assinatura, sem banco
// (cobertas em `test/billing-catalog.test.ts`).

/** +N meses fixando no último dia quando o mês de destino é mais curto (31/jan + 1 = 28/fev).
 *  Mesma lição do `somarCiclo` da Academia: `setMonth` puro estoura (31/jan + 1 = 3/mar). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const digits = (s: string) => s.replace(/\D/g, '');
const allSame = (s: string) => /^(\d)\1+$/.test(s);

function cpfOk(c: string): boolean {
  if (c.length !== 11 || allSame(c)) return false;
  for (const len of [9, 10]) {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(c[i]) * (len + 1 - i);
    const dv = ((s * 10) % 11) % 10;
    if (dv !== Number(c[len])) return false;
  }
  return true;
}
function cnpjOk(c: string): boolean {
  if (c.length !== 14 || allSame(c)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, wi, i) => a + Number(c[i]) * wi, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

/** CPF ou CNPJ com dígito verificador; devolve só os dígitos, ou `null` se inválido. */
export function normalizeDocument(raw: string): string | null {
  const d = digits(raw);
  return cpfOk(d) || cnpjOk(d) ? d : null;
}
