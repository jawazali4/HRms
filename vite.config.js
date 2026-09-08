import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Frontend source lives in /frontend
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: 'dist', // → /frontend/dist (matches netlify.toml publish)
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    // Allow the Arena live-preview hostname (and any *.e2b.app tunnel)
    allowedHosts: ['.e2b.app'],
    // During local development, send /api calls to the Express backend
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
