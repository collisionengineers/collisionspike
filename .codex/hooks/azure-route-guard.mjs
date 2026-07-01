// azure-route-guard.mjs — non-blocking PreToolUse router for collisionspike Azure work.
//
// When a Bash/PowerShell command is a high-value Azure op (`az role|keyvault|monitor|functionapp`,
// `func azure ... publish`, `psql`, KQL, Graph/Exchange-RBAC), inject a ONE-LINE reminder of which
// skill/playbook/agent to reach for FIRST — so we route instead of hand-rolling and churning.
// ALWAYS exits 0 (purely informational; never blocks). Low-noise: one hint per command, and only
// for the specific high-value ops (see azure-guard-lib.mjs). See docs/azure/README.md + AGENTS.md.
import { routeHint } from './azure-guard-lib.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw || '{}');
    const tool = ev.tool_name || '';
    if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
    const cmd = String((ev.tool_input || {}).command || '');
    const hint = routeHint(cmd);
    if (hint) {
      const msg = '[azure-route-guard] ' + hint;
      // stdout JSON additionalContext reaches Claude's context; systemMessage surfaces to the user.
      process.stdout.write(
        JSON.stringify({
          systemMessage: msg,
          hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg },
        }),
      );
    }
  } catch {
    /* never block on hook errors */
  }
  process.exit(0);
});
