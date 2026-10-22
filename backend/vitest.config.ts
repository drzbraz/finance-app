import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const MONGO = './src/testing/mongo.global-setup.ts';

/**
 * Three suites: fast unit tests, repositories against a real MongoDB, and the HTTP API end to end.
 * SWC instead of esbuild, because Nest's dependency injection needs emitDecoratorMetadata.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { transform: { useDefineForClassFields: false } } })],
  resolve: { alias: { '@finance/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    projects: [
      { test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      { test: { name: 'integration', include: ['src/**/*.integration-spec.ts'], globalSetup: [MONGO], hookTimeout: 120_000 } },
      { test: { name: 'e2e', include: ['test/**/*.e2e-spec.ts'], globalSetup: [MONGO], hookTimeout: 120_000 } },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/testing/**', 'src/**/*.spec.ts', 'src/**/*.integration-spec.ts'],
      // `npm run check` fails below these (today: ~98% lines, ~93% branches).
      thresholds: { lines: 95, statements: 95, branches: 90, functions: 95 },
    },
  },
});
