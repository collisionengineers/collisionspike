#!/usr/bin/env node
// Cursor beforeShellExecution — remind to build SPA before SWA deploy.
function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
  });
}

const raw = await readStdin();
let cmd = '';
try {
  const ev = JSON.parse(raw || '{}');
  cmd = String(ev.command || '');
} catch {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

if (/swa\s+deploy|az\s+staticwebapp/i.test(cmd) && !/npm\s+run\s+build/i.test(cmd)) {
  const msg =
    '[spa-deploy-guard] Before deploying the SPA: run `npm run build` from `mockup-app/` first. ' +
    'After deploy, hard-refresh the SWA edge cache (Ctrl+Shift+R) — stale assets are a common false "it works".';
  process.stdout.write(
    JSON.stringify({
      permission: 'allow',
      agent_message: msg,
    }),
  );
} else {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
}
