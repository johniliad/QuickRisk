import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * FAIR QuickRisk — production build configuration.
 *
 * The build emits static HTML/CSS/JavaScript only. No Node.js runtime, application
 * server or development server is required in production; Apache serves the output
 * and PHP handles the calculation endpoint.
 *
 * Base path: the application is published at https://quickrisk.iliadis.net/, so the
 * default base is "/". Set VITE_BASE_PATH=/quickrisk/ to publish it under
 * https://www.iliadis.net/quickrisk/ instead.
 *
 * Source maps are deliberately disabled so that no TypeScript source is ever
 * exposed through the public URL.
 */
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The authoritative model is imported at BUILD TIME. Only the public
      // presentation files may be imported; parameters.json is server-only and is
      // guarded by tools/verify-frontend-boundary.mjs.
      '@model': fileURLToPath(new URL('../fairquickmodel', import.meta.url)),
    },
  },
  server: {
    fs: {
      // Development server only: allow reading the model directory above the root.
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    assetsDir: 'assets',
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        // The main application.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // The read-only share shell served at /live/share/{token}. It is a second HTML entry
        // because the application deliberately has no SPA router.
        'live/share': fileURLToPath(new URL('./live/share/index.html', import.meta.url)),
      },
    },
  },
});
