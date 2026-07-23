import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const domainSrc = (relative: string): string => resolve(here, '..', '..', 'packages/domain/src', relative);
const serverRuntimeSrc = (relative: string): string =>
  resolve(here, '..', '..', 'packages/server-runtime/src', relative);
const intakeEngineSrc = (relative: string): string =>
  resolve(here, '..', 'intake-engine/src', relative);

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    alias: [
      { find: '@cs/domain/codecs', replacement: domainSrc('codecs/index.ts') },
      { find: '@cs/domain/gates', replacement: domainSrc('gates.ts') },
      { find: '@cs/domain', replacement: domainSrc('index.ts') },
      { find: '@cs/intake-engine', replacement: intakeEngineSrc('index.ts') },
      {
        find: '@cs/server-runtime/focused-function-client',
        replacement: serverRuntimeSrc('focused-function-client/index.ts'),
      },
      { find: '@cs/server-runtime', replacement: serverRuntimeSrc('index.ts') },
    ],
  },
});
