import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const domainSrc = (relative: string): string => resolve(here, '..', '..', 'packages/domain/src', relative);

// `tsc -b` emits compiled copies of the *.test.ts files into dist/ (declaration:true,
// project convention). Exclude dist so vitest runs each suite ONCE from src/ — not also
// the stale compiled JS copy.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    // Tests must exercise this checkout's domain source, never an ignored/stale dist
    // directory left by another worktree.
    alias: [
      { find: '@cs/domain/codecs', replacement: domainSrc('codecs/index.ts') },
      { find: '@cs/domain/gates', replacement: domainSrc('gates.ts') },
      { find: '@cs/domain', replacement: domainSrc('index.ts') },
    ],
  },
});
