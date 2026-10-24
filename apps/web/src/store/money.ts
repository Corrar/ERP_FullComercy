// src/store/money.ts — soma de exibição em CENTAVOS inteiros (sem erro de ponto flutuante).
// Só para o "a partir de" da vitrine; o total que vale é sempre o do servidor (`quote`).
export const D = (s: string) => Math.round(Number(s) * 100);

/** "a partir de" de um módulo, em centavos: base + a função obrigatória do módulo + as que ela
 *  exige, somadas do catálogo (a vitrine e a apresentação mostram o mesmo número). */
export function aPartirDe(catalog: { features: { key: string; module: string | null; required?: boolean; requires?: string[]; price: string }[] }, m: string) {
  const req = catalog.features.find((f) => f.module === m && f.required);
  const keys = new Set(['core.base', ...(req ? [req.key, ...(req.requires ?? [])] : [])]);
  return catalog.features.filter((f) => keys.has(f.key)).reduce((a, f) => a + D(f.price), 0);
}
