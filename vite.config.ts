import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const clientRoot = fileURLToPath(new URL('./src/client', import.meta.url));
const sharedRoot = fileURLToPath(new URL('./src/shared', import.meta.url));
const devProxyTarget =
  process.env['VITE_DEV_PROXY_TARGET'] ?? 'http://localhost:3001';

export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': sharedRoot,
    },
  },
  server: {
    allowedHosts: ['mmdebian.local', 'mmdebian.mendoza.home'],
    host: '0.0.0.0',
    port: 5176,
    strictPort: true,
    proxy: {
      '/healthz': devProxyTarget,
      '/api': devProxyTarget,
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
});
