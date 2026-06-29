import { defineConfig } from 'vitest/config';

// `tsc -b` emits compiled copies of the *.test.ts files into dist/ (declaration:true,
// project convention). Exclude dist so vitest runs each suite ONCE from src/ — not also
// the stale compiled JS copy.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
  },
});
