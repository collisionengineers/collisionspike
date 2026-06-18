// `defineConfig` from vitest/config extends Vite's config with the `test` block.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Power Apps Code App build plugin — emits the deploy manifest + SDK runtime
// bootstrap so `power-apps push` can package the Vite output. Build/dev only;
// it is inert under the Vitest `node` env below (no DOM, no network).
import { powerApps } from '@microsoft/power-apps-vite/plugin';

// Power Apps Code App (M1): mock-backed offline, Dataverse-backed once the seam
// is configured at startup (see src/main.tsx). The powerApps() plugin attaches
// the Power Platform deploy metadata; data still flows through the src/data seam.
export default defineConfig({
  plugins: [react(), powerApps()],
  server: { port: 5173, open: false },
  // Pure, deterministic contract tests — node env, no jsdom required.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
