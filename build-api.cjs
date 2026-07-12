// Bundle the Data API for deploy (esbuild borrowed from mockup-app, same as build-orch.cjs).
// Includes the import.meta.url banner/define guard defensively (harmless if unused).
// esbuild: prefer mockup-app's copy (dev env), fall back to the root node_modules (WSL/CI env).
const esbuild = (() => {
  try { return require('./mockup-app/node_modules/esbuild'); }
  catch { return require('esbuild'); }
})();
esbuild.build({
  entryPoints: ['api/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Native Sharp/libvips binaries cannot be embedded in a single JS bundle.
  // deploy/api/package.json ships the Linux x64 production dependency beside it.
  external: ['@azure/functions', 'sharp'],
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  outfile: 'deploy/api/main.cjs',
}).then(() => console.log('api bundle OK')).catch((e) => { console.error(e); process.exit(1); });
