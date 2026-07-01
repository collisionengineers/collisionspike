#!/usr/bin/env node
// Cursor afterShellExecution adapter — Box scope allowlist grower (bookkeeping only).
import { loadConfig, appendAllowedId } from '../../.claude/hooks/box-scope-lib.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
  });
}

const raw = await readStdin();
try {
  const ev = JSON.parse(raw || '{}');
  const cmd = String(ev.command || '');
  if (!/box(?:\.cmd)?\s+(?:folders:create|files:upload|file-requests:copy|webhooks:create)\b/i.test(cmd)) {
    process.exit(0);
  }

  const output = ev.output ?? ev.stdout ?? '';
  const out = typeof output === 'string' ? output : String(output || '');
  if (!out.trim()) process.exit(0);

  let obj;
  try {
    obj = JSON.parse(out);
  } catch {
    process.exit(0);
  }

  const items = Array.isArray(obj) ? obj : Array.isArray(obj.entries) ? obj.entries : [obj];
  const cfg = loadConfig();
  const added = [];
  for (const it of items) {
    const id = it && it.id != null ? String(it.id) : '';
    if (!id || id === '0') continue;
    const parentId = it && it.parent && it.parent.id != null ? String(it.parent.id) : '';
    const parentOk = !parentId || parentId === cfg.allowedRoot || cfg.allowedIds.includes(parentId);
    if (!parentOk) continue;
    if (appendAllowedId(id)) added.push(id);
  }
  if (added.length) {
    process.stderr.write('[box-scope-guard] now tracking in-scope Box id(s): ' + added.join(', ') + '\n');
  }
} catch {
  /* bookkeeping only */
}
