const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..', '..');
const api = resolve(root, '.artifacts', 'deploy', 'data-api');
const orchestration = resolve(root, '.artifacts', 'deploy', 'orchestration');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function install(cwd, args) {
  execFileSync(npm, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

// Azure Functions runs these apps on Linux x64/glibc. Supplying the target explicitly is
// essential on Windows: Sharp otherwise installs a Windows binary that packages successfully
// but fails only when the live evidence-upload route first decodes an image.
install(api, [
  'ci',
  '--omit=dev',
  '--include=optional',
  '--os=linux',
  '--cpu=x64',
  '--libc=glibc',
]);
install(orchestration, ['ci', '--omit=dev', '--include=optional']);

for (const relative of [
  'node_modules/@azure/functions',
  'node_modules/@img/sharp-linux-x64',
  'node_modules/@img/sharp-libvips-linux-x64',
]) {
  if (!existsSync(resolve(api, relative))) {
    throw new Error(`Data API deployment artifact is missing ${relative}`);
  }
}

for (const relative of [
  'node_modules/@azure/functions',
  'node_modules/durable-functions',
]) {
  if (!existsSync(resolve(orchestration, relative))) {
    throw new Error(`Orchestration deployment artifact is missing ${relative}`);
  }
}

console.log('Self-contained Linux Azure Functions artifacts are ready.');
