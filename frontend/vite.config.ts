/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Local-only: the built app may only talk to its own origin, where /api is the backend.
// Injected at build time only, because the dev server needs inline scripts and a HMR websocket.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'";

/** `npm run dev`: the backend started with `npm run dev:backend` (or Docker on 127.0.0.1:3000). */
const DEV_API = process.env.API_URL ?? 'http://localhost:3000';

function cspPlugin(): Plugin {
  return {
    name: 'local-only-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  resolve: {
    alias: { '@finance/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)) },
  },
  server: { proxy: { '/api': DEV_API } },
  preview: { proxy: { '/api': DEV_API } },
  test: {
    globals: true,
    environment: 'node',
    // Screens and components run in a browser-like DOM.
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['tests/setup.ts'],
    // `npm run check` fails when coverage drops below these (today: ~98% lines, ~94% branches).
    coverage: {
      include: ['src/**'],
      exclude: ['src/main.tsx'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 95, statements: 95, branches: 90, functions: 80 },
    },
  },
});
