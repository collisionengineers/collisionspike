#!/usr/bin/env node
// Cursor beforeShellExecution adapter — Azure route reminder (non-blocking).
import { routeHint } from '../../.claude/hooks/azure-guard-lib.mjs';

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

const hint = routeHint(cmd);
if (hint) {
  const msg = '[azure-route-guard] ' + hint;
  process.stdout.write(
    JSON.stringify({
      permission: 'allow',
      agent_message: msg,
    }),
  );
} else {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
}
