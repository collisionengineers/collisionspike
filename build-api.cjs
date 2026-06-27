// Bundle the Data API for deploy (esbuild borrowed from mockup-app, same as build-orch.cjs).
// Includes the import.meta.url banner/define guard defensively (harmless if unused).
const esbuild = require('./mockup-app/node_modules/esbuild');
esbuild.build({
  entryPoints: ['api/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['@azure/functions'],
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  outfile: 'deploy/api/main.cjs',
}).then(() => console.log('api bundle OK')).catch((e) => { console.error(e); process.exit(1); });
