import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Em dev, /api e /socket.io são repassados para a API local: o front chama caminhos relativos
// e não existe CORS em desenvolvimento. Em produção o nginx faz o mesmo (apps/web/nginx.conf).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_PROXY ?? 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: process.env.API_PROXY ?? 'http://localhost:3000', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
