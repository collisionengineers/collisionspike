import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Deviation from packages/domain's vitest.config.ts: this package's tests live in a
    // top-level tests/ directory (see README.md) rather than co-located as src/**/*.test.ts,
    // so both roots are included.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
  },
});
