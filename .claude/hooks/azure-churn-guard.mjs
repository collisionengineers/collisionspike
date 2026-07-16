// azure-churn-guard.mjs — non-blocking PostToolUse anti-churn escalator for collisionspike.
//
// This is the part that actually stops the loop. PreToolUse can't see failures; this PostToolUse
// guard inspects the result of a Bash/PowerShell Azure op and, when the SAME op fails a second
// time within the window, injects a STOP message telling Claude to invoke the diagnostic skill /
// microsoft-docs before a third attempt (the "two-strikes" rule from CLAUDE.md). A success clears
// the counter. ALWAYS exits 0; fails OPEN (a guard error never blocks). See azure-guard-lib.mjs.
import { isAzureOp, looksFailed, recordFailure, clearFailure } from './azure-guard-lib.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw || '{}');
    const tool = ev.tool_name || '';
    if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
    const cmd = String((ev.tool_input || {}).command || '');
    if (!isAzureOp(cmd)) process.exit(0);

    if (!looksFailed(ev.tool_response)) {
      clearFailure(cmd); // op succeeded (or no error signal) — reset its strike count
      process.exit(0);
    }

    const now = typeof ev.__now === 'number' ? ev.__now : Date.now();
    const count = recordFailure(cmd, now);
    if (count >= 2) {
      const msg =
        `[azure-churn-guard] STOP — this Azure op has now failed ${count}× in a row. Do NOT run it again. ` +
        'Two-strikes rule: invoke the matching skill (`azure:azure-diagnostics` / `azure:azure-kusto` / ' +
        '`azure:azure-rbac`) or `microsoft-docs:microsoft-docs` to find out WHY first, or dispatch the ' +
        '**azure-diagnostician** agent. Route via docs/operations/README.md before a third attempt.';
      process.stdout.write(
        JSON.stringify({
          systemMessage: msg,
          hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg },
        }),
      );
    }
  } catch {
    /* never block on hook errors */
  }
  process.exit(0);
});
