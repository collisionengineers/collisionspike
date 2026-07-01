#!/usr/bin/env node
// Cursor beforeShellExecution adapter — Box scope guard (fail-closed).
import { loadConfig, isBoxCommand, analyze } from '../../.claude/hooks/box-scope-lib.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
  });
}

function deny(reason) {
  const msg = '[box-scope-guard] BLOCKED — ' + reason;
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      agent_message: msg,
      user_message: 'This Box command is outside the allowed test scope.',
    }),
  );
  process.exit(0);
}

const raw = await readStdin();
let cmd = '';
try {
  const ev = JSON.parse(raw || '{}');
  cmd = String(ev.command || '');
} catch {
  process.exit(0);
}

if (!cmd || !isBoxCommand(cmd)) {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

try {
  const cfg = loadConfig();
  if (cfg.liveReady) {
    process.stdout.write(JSON.stringify({ permission: 'allow' }));
    process.exit(0);
  }
  const root = cfg.allowedRoot;
  const allowed = new Set([root, ...cfg.allowedIds]);
  const a = analyze(cmd);

  if (a.touchesFolderZero) {
    deny(
      `command references Box folder 0 (All Files root). Only the test folder ${root} ` +
        `and its descendants are in scope.`,
    );
  }

  const bad = [...a.ids].filter((id) => !allowed.has(id));
  if (bad.length) {
    deny(
      `Box id(s) [${bad.join(', ')}] are outside the test folder ${root}.\n` +
        `  In scope: root ${root} + ${cfg.allowedIds.length} tracked descendant id(s).\n` +
        `  A child created under the root is tracked automatically right after creation.\n` +
        `  To operate beyond the test folder, set liveReady=true in tools/box-scope.json (only when ready for live).`,
    );
  }

  if (a.webhookCreate) {
    const badTargets = a.webhookTargets.filter((t) => !allowed.has(t));
    if (a.webhookTargets.length === 0 || badTargets.length) {
      deny(
        `a webhook may only target the test folder ${root} or a tracked descendant ` +
          `(got ${a.webhookTargets.join(', ') || 'no resolvable target'}). ` +
          `A webhook on any other folder — or with an id the guard can't see — could fire tenant-wide.`,
      );
    }
  }

  process.stdout.write(JSON.stringify({ permission: 'allow' }));
} catch (e) {
  deny(`could not validate this Box command, failing closed: ${e && e.message ? e.message : e}`);
}
