// `defineConfig` from vitest/config extends Vite's config with the `test` block.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Absolute paths to the @cs/domain source, resolved from apps/web/.
const here = dirname(fileURLToPath(import.meta.url));
const domainSrc = (rel: string): string => resolve(here, '..', '..', 'packages/domain/src', rel);
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // Local dev: forward /api to the live dev Data API server-side, so the browser
    // stays same-origin (no Function-App CORS change needed). Pairs with
    // apps/web/.env.local (VITE_API_BASE_URL=http://localhost:5173) and the
    // localhost:5173 spa redirectUri on the CollisionSpike SPA app registration.
    proxy: {
      '/api': {
        target: 'https://cespk-api-dev.azurewebsites.net',
        changeOrigin: true,
      },
    },
  },
  // Keep pure contract tests in Node; rendered component files opt into jsdom with
  // `@vitest-environment jsdom` so most of the suite stays lightweight.
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup-dom.ts'],
    // Resolve @cs/domain (and its subpaths) to the package SOURCE for tests only, so the
    // suite never depends on a freshly-built ./dist. The package's `import` condition points
    // at ./dist/index.js, so an out-of-date / missing `tsc -b` build of @cs/domain would
    // otherwise surface as runtime errors like `extractVrm is not a function` (finding #15).
    // SCOPED to vitest's `test` block — the production `vite build` still uses ./dist.
    // The two subpath entries MUST precede the bare '@cs/domain' entry: alias matching is
    // first-win prefix matching, so the root would otherwise swallow `@cs/domain/codecs`.
    alias: [
      { find: '@cs/domain/codecs', replacement: domainSrc('codecs/index.ts') },
      { find: '@cs/domain/gates', replacement: domainSrc('gates.ts') },
      { find: '@cs/domain', replacement: domainSrc('index.ts') },
    ],
  },
});
