#!/usr/bin/env node
// Cursor afterShellExecution adapter — Azure two-strikes churn guard (non-blocking).
import { isAzureOp, looksFailed, recordFailure, clearFailure } from '../../.claude/hooks/azure-guard-lib.mjs';

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
  if (!isAzureOp(cmd)) {
    process.exit(0);
  }

  const output = ev.output ?? ev.stdout ?? ev.stderr ?? '';
  const toolResponse = typeof output === 'string' ? output : JSON.stringify(output || '');

  if (!looksFailed(toolResponse)) {
    clearFailure(cmd);
    process.exit(0);
  }

  const count = recordFailure(cmd, Date.now());
  if (count >= 2) {
    const msg =
      `[azure-churn-guard] STOP — this Azure op has now failed ${count}× in a row. Do NOT run it again. ` +
      'Two-strikes rule: invoke the matching skill (`azure:azure-diagnostics` / `azure:azure-kusto` / ' +
      '`azure:azure-rbac`) or `microsoft-docs:microsoft-docs` to find out WHY first, or dispatch the ' +
      '**azure-diagnostician** agent. Route via docs/azure/README.md before a third attempt.';
    process.stdout.write(JSON.stringify({ additional_context: msg }));
  }
} catch {
  /* never block on hook errors */
}
