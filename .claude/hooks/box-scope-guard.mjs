// box-scope-guard.mjs — BLOCKING PreToolUse guard for the Box integration build.
//
// Until tools/box-scope.json sets liveReady=true, every Box CLI/REST/SDK command must
// stay within the test folder (allowedRoot) and its tracked descendants. Anything that
// references Box folder 0 or an id outside the allowlist is BLOCKED (exit 2; stderr is
// fed back to Claude as the reason). Non-Box commands are always allowed (exit 0).
// For Box commands the guard FAILS CLOSED: if it cannot validate, it blocks.
import { loadConfig, isBoxCommand, analyze } from './box-scope-lib.mjs';

function deny(reason) {
  process.stderr.write('[box-scope-guard] BLOCKED — ' + reason + '\n');
  process.exit(2);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    const ev = JSON.parse(raw || '{}');
    if ((ev.tool_name || '') !== 'Bash') process.exit(0);
    cmd = String((ev.tool_input || {}).command || '');
  } catch {
    process.exit(0); // can't parse the event — not our concern
  }
  if (!cmd || !isBoxCommand(cmd)) process.exit(0); // not a Box op — allow

  // Box op: from here, any failure FAILS CLOSED.
  try {
    const cfg = loadConfig();
    if (cfg.liveReady) {
      process.stderr.write('[box-scope-guard] liveReady=true — scope guard lifted; Box op allowed.\n');
      process.exit(0);
    }
    const root = cfg.allowedRoot;
    const allowed = new Set([root, ...cfg.allowedIds]);
    const a = analyze(cmd);

    if (a.touchesFolderZero) {
      deny(
        `command references Box folder 0 (All Files root). Only the test folder ${root} ` +
          `and its descendants are in scope.`
      );
    }

    const bad = [...a.ids].filter((id) => !allowed.has(id));
    if (bad.length) {
      deny(
        `Box id(s) [${bad.join(', ')}] are outside the test folder ${root}.\n` +
          `  In scope: root ${root} + ${cfg.allowedIds.length} tracked descendant id(s).\n` +
          `  A child created under the root is tracked automatically right after creation.\n` +
          `  To operate beyond the test folder, set liveReady=true in tools/box-scope.json (only when ready for live).`
      );
    }

    if (a.webhookCreate) {
      const badTargets = a.webhookTargets.filter((t) => !allowed.has(t));
      if (a.webhookTargets.length === 0 || badTargets.length) {
        deny(
          `a webhook may only target the test folder ${root} or a tracked descendant ` +
            `(got ${a.webhookTargets.join(', ') || 'no resolvable target'}). ` +
            `A webhook on any other folder — or with an id the guard can't see — could fire tenant-wide.`
        );
      }
    }

    process.exit(0); // every referenced id is in scope — allow
  } catch (e) {
    deny(`could not validate this Box command, failing closed: ${e && e.message ? e.message : e}`);
  }
});
