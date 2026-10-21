// src/store/money.ts — soma de exibição em CENTAVOS inteiros (sem erro de ponto flutuante).
// Só para o "a partir de" da vitrine; o total que vale é sempre o do servidor (`quote`).
export const D = (s: string) => Math.round(Number(s) * 100);
