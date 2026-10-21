/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Local-only: the built app may not open any network connection.
// Injected at build time only, because the dev server needs inline scripts and a HMR websocket.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'";

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
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
