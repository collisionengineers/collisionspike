// `defineConfig` from vitest/config extends Vite's config with the `test` block.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Absolute paths to the @cs/domain SOURCE, resolved relative to THIS config file
// (mockup-app/) and up one level ('..') to the monorepo root.
const here = dirname(fileURLToPath(import.meta.url));
const domainSrc = (rel: string): string => resolve(here, '..', 'packages/domain/src', rel);

// Off Power Platform: powerApps() plugin removed (it emitted the deploy manifest
// + SDK runtime bootstrap for `pac code push`; the app now deploys to Azure
// Static Web Apps via `@azure/static-web-apps-cli`).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // Local dev: forward /api to the live dev Data API server-side, so the browser
    // stays same-origin (no Function-App CORS change needed). Pairs with
    // mockup-app/.env.local (VITE_API_BASE_URL=http://localhost:5173) and the
    // localhost:5173 spa redirectUri on the CollisionSpike SPA app registration.
    proxy: {
      '/api': {
        target: 'https://cespk-api-dev.azurewebsites.net',
        changeOrigin: true,
      },
    },
  },
  // Pure, deterministic contract tests — node env, no jsdom required.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
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
