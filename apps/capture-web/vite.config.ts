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
  server: {
    // Dev-only boundary verification (CCAP-013): forward the relative /api base
    // to a locally running CollisionSpike data-api so cookies stay same-origin.
    // Production is same-origin by architecture (SWA linked backend) — no proxy.
    proxy: {
      '/api': {
        target: process.env.CAPTURE_DEV_API_PROXY ?? 'http://localhost:7071',
        changeOrigin: false
      }
    }
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**']
  }
});
