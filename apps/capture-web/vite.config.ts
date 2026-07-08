import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@collisioncapture/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
      '@collisioncapture/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
  }
});
