// `defineConfig` from vitest/config extends Vite's config with the `test` block.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Standalone M1 prototype — no Power Platform, no network calls, mock data only.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  // Pure, deterministic contract tests — node env, no jsdom required.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
