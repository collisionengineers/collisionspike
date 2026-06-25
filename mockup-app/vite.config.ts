// `defineConfig` from vitest/config extends Vite's config with the `test` block.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Power Apps Code App build plugin — emits the deploy manifest + SDK runtime
// bootstrap so `power-apps push` can package the Vite output. Build/dev only;
// it is inert under the Vitest `node` env below (no DOM, no network).
import { powerApps } from '@microsoft/power-apps-vite/plugin';

// Power Apps Code App (M1): the DEPLOYED build is Dataverse-backed — src/main.tsx
// calls configureDataAccess(generatedServices) at startup, so the SDK + the
// pac-generated services are pulled into the bundle and real rows flow through the
// src/data seam. The mock source is only the pre-bootstrap default + the SDK-free
// unit tests (vitest `node` env below). The powerApps() plugin attaches the Power
// Platform deploy metadata.
export default defineConfig({
  plugins: [react(), powerApps()],
  server: { port: 5173, open: false },
  // Pure, deterministic contract tests — node env, no jsdom required.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
