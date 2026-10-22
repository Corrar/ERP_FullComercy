// src/app/theme.ts — tema claro/escuro (como a alternância da sidebar do Fluxo). Persiste por
// aparelho e só troca `data-theme` no <html>: as telas leem as variáveis do styles.css.
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'fc.theme';
const read = (): Theme => {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch { /* privado */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
export const applyTheme = (t: Theme) => { document.documentElement.dataset.theme = t; };
applyTheme(read());

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => { applyTheme(theme); try { localStorage.setItem(KEY, theme); } catch { /* privado */ } }, [theme]);
  return { theme, setTheme };
}
