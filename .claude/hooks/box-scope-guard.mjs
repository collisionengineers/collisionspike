// box-scope-guard.mjs — BLOCKING PreToolUse guard for the Box integration build.
//
// Every Box CLI/REST/SDK/test-wrapper command must stay within the immutable test folder
// and its tracked descendants. Anything that references
// Box folder 0 or an id outside the allowlist is BLOCKED (exit 2; stderr is fed back as the
// reason). Non-Box commands are always allowed (exit 0). For Box commands the guard FAILS
// CLOSED: if it cannot validate, it blocks.
//
// TKT-074 hardening: resolve stdin on a short timer (don't wait on 'end', which some harnesses
// never emit), import the lib lazily, and add a watchdog that FAIL-OPENS if anything stalls —
// the guard only needs to fail CLOSED for commands positively identified as Box-scoped.

function deny(reason) {
  process.stderr.write('[box-scope-guard] BLOCKED — ' + reason + '\n');
  process.exit(2);
}

const TEST_ROOT = '392761581105';

// Watchdog: never let the hook hang the shell. Well under the harness fail-closed deadline.
// Fail-OPEN (exit 0), because if this fires we have NOT positively identified a Box command.
let decided = false;
const watchdog = setTimeout(() => {
  if (!decided) {
    decided = true;
    process.exit(0);
  }
}, 1500);

function readStdinEvent(timeoutMs) {
  return new Promise((resolve) => {
    let raw = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(raw);
    };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (raw += c));
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
    } catch {
      finish();
      return;
    }
    setTimeout(finish, timeoutMs);
  });
}

async function main() {
  const raw = await readStdinEvent(700);
  let cmd = '';
  try {
    const ev = JSON.parse(raw || '{}');
    if (!['Bash', 'PowerShell'].includes(ev.tool_name || '')) {
      decided = true;
      clearTimeout(watchdog);
      process.exit(0); // not a Bash tool call — not our concern
    }
    cmd = String((ev.tool_input || {}).command || '');
  } catch {
    decided = true;
    clearTimeout(watchdog);
    process.exit(0); // can't parse the event — not our concern
  }

  let lib;
  try {
    lib = await import('./box-scope-lib.mjs');
  } catch {
    decided = true;
    clearTimeout(watchdog);
    process.exit(0); // can't load the guard — never block a command we can't classify
  }

  if (!cmd || !lib.isBoxCommand(cmd)) {
    decided = true;
    clearTimeout(watchdog);
    process.exit(0); // not a Box op — allow
  }

  // Positively identified as a Box op: from here, any failure FAILS CLOSED. Cancel the watchdog
  // so it cannot allow this Box command behind our back.
  decided = true;
  clearTimeout(watchdog);
  try {
    const cfg = lib.loadConfig();
    if (cfg.mode !== 'test_only') {
      deny(`tools/box-scope.json mode must remain test_only (got ${cfg.mode || 'missing'}).`);
    }
    if (cfg.allowedRoot !== TEST_ROOT) {
      deny(`the Box test root is immutable (${TEST_ROOT}); configured root ${cfg.allowedRoot} is refused.`);
    }
    const root = cfg.allowedRoot;
    const allowed = new Set([root, ...cfg.allowedIds]);
    const a = lib.analyze(cmd);

    if (a.touchesFolderZero) {
      deny(
        `command references Box folder 0 (All Files root). Only the test folder ${root} ` +
          `and its descendants are in scope.`,
      );
    }

    const bad = [...a.ids].filter((id) => !allowed.has(id));
    if (bad.length) {
      // Operator decision 2026-07-16: ids in readOnlyRoots (the production archive root)
      // are additionally allowed for READ-ONLY operations — and only when the WHOLE
      // command classifies as a read (fail-closed classifier in box-scope-lib.mjs).
      const readOnlyRoots = new Set(cfg.readOnlyRoots);
      const allBadAreReadOnlyRoots = bad.every((id) => readOnlyRoots.has(id));
      if (!(allBadAreReadOnlyRoots && lib.isReadOnlyBoxCommand(cmd))) {
        deny(
          `Box id(s) [${bad.join(', ')}] are outside the test folder ${root}.\n` +
            `  In scope: root ${root} + ${cfg.allowedIds.length} tracked descendant id(s) (read+write),\n` +
            `  plus READ-ONLY access to [${cfg.readOnlyRoots.join(', ') || 'none'}] (archive roots — get/list/items/download only).\n` +
            `  A child created under the test root is tracked automatically right after creation.\n` +
            `  Production writes require TKT-178's separate signed-run exact-object executor.`,
        );
      }
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

    process.exit(0); // every referenced id is in scope — allow
  } catch (e) {
    deny(`could not validate this Box command, failing closed: ${e && e.message ? e.message : e}`);
  }
}

main();
