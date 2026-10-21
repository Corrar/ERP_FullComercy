// playwright.demos.config.ts — GRAVA os vídeos de demonstração da loja (não é teste). Mesmo par de
// servidores do e2e (API 3300 + Vite 5180, banco local migrado). Rodar: `npm run demos`
// (grava demos/*.demo.ts e chama demos/finalizar.mjs, que gera public/demos/*.mp4 + pôster).
import { defineConfig } from '@playwright/test';

const API = 'http://127.0.0.1:3300';

export default defineConfig({
  testDir: './demos',
  testMatch: '*.demo.ts',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5180', locale: 'pt-BR' },
  webServer: [
    { command: 'npx ts-node -T src/server.ts', cwd: '../api', port: 3300, env: { PORT: '3300', JOBS_ENABLED: '0' }, reuseExistingServer: true, timeout: 60_000 },
    { command: `npx vite --port 5180 --strictPort`, env: { API_PROXY: API }, port: 5180, reuseExistingServer: true, timeout: 60_000 },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } }],
});
