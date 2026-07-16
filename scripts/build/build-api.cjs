const { execFileSync } = require('node:child_process');
const { copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const esbuild = require('esbuild');

const root = resolve(__dirname, '..', '..');
const service = resolve(root, 'services', 'data-api');
const output = resolve(root, '.artifacts', 'deploy', 'data-api');

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

esbuild.build({
  absWorkingDir: root,
  entryPoints: [resolve(service, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['@azure/functions', 'sharp'],
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  outfile: resolve(output, 'main.cjs'),
}).then(() => {
  copyFileSync(resolve(service, 'host.json'), resolve(output, 'host.json'));
  writeFileSync(resolve(output, 'package.json'), `${JSON.stringify({
    name: '@cs/data-api-deploy',
    version: '1.0.0',
    private: true,
    main: 'main.cjs',
    dependencies: {
      '@azure/functions': '^4.5.0',
      sharp: '^0.35.3',
    },
  }, null, 2)}\n`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['install', '--package-lock-only', '--omit=dev', '--ignore-scripts'], {
    cwd: output,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log(`Data API bundle written to ${output}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
