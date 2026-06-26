// Bundle the orchestration app for deploy. Fixes the ESM->CJS `import.meta.url`
// gotcha (createRequire(import.meta.url) -> undefined) that left the host registering
// 0 functions: define import.meta.url to a real file URL via a banner.
const esbuild = require('./mockup-app/node_modules/esbuild');
esbuild.build({
  entryPoints: ['orchestration/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['@azure/functions', 'durable-functions'],
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  outfile: 'deploy/orch/main.cjs',
}).then(() => console.log('orch bundle OK')).catch((e) => { console.error(e); process.exit(1); });
