// `defineConfig` from vitest/config extends Vite's config with the `test` block.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Off Power Platform: powerApps() plugin removed (it emitted the deploy manifest
// + SDK runtime bootstrap for `pac code push`; the app now deploys to Azure
// Static Web Apps via `@azure/static-web-apps-cli`).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  // Pure, deterministic contract tests — node env, no jsdom required.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
