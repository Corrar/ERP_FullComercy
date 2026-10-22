// playwright.config.ts — e2e do FRONT no navegador real. Sobe a API (porta 3300, .env de apps/api)
// e o Vite (porta 5180, proxy para a API) e roda os cenários em e2e/*.spec.ts.
// Exige banco migrado + seed (mesmo pré-requisito do e2e da API).
import { defineConfig } from '@playwright/test';

const API = 'http://127.0.0.1:3300';
const WEB = 'http://127.0.0.1:5180';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: WEB, trace: 'retain-on-failure', locale: 'pt-BR' },
  webServer: [
    { command: 'npx ts-node -T src/server.ts', cwd: '../api', port: 3300, env: { PORT: '3300', JOBS_ENABLED: '0', RATE_LIMIT_PER_MIN: '20000' }, reuseExistingServer: true, timeout: 60_000 },
    // Vite em 127.0.0.1 explícito: sem --host ele segue o `localhost` do sistema, que no runner do
    // GitHub resolve para ::1 — a checagem por porta aceitava ::1 e o navegador, em 127.0.0.1, era recusado.
    { command: `npx vite --host 127.0.0.1 --port 5180 --strictPort`, env: { API_PROXY: API }, url: WEB, reuseExistingServer: true, timeout: 60_000 },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } }],
});
