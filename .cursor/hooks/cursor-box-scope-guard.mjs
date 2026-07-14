#!/usr/bin/env node
// Cursor beforeShellExecution adapter — Box scope guard.
//
// TKT-074 fix: the previous version awaited the stdin 'end' event and used a STATIC import of
// the guard lib at module load. The Cursor beforeShellExecution harness writes the event to
// stdin but does NOT close it, so 'end' never fired and the hook produced no output within the
// ~60s fail-closed deadline — which blocked EVERY shell command, Box or not.
//
// This version keeps a fast, non-blocking common path: stdin resolves on a short timer even if
// 'end' never fires, the lib is imported lazily, and a hard internal watchdog FAIL-OPENS if
// anything (stdin, import, config) stalls. The guard only needs to fail CLOSED for commands it
// has POSITIVELY identified as Box-scoped — which it still does (see the Box branch below).

function allow() {
  try {
    process.stdout.write(JSON.stringify({ permission: 'allow' }));
  } catch {}
  process.exit(0);
}

function deny(reason) {
  try {
    process.stdout.write(
      JSON.stringify({
        permission: 'deny',
        agent_message: '[box-scope-guard] BLOCKED — ' + reason,
        user_message: 'This Box command is outside the allowed test scope.',
      }),
    );
  } catch {}
  process.exit(0);
}

const TEST_ROOT = '392761581105';

// Watchdog: never let the hook hang the shell. Well under the harness fail-closed deadline.
// Fail-OPEN, because if this fires we have NOT positively identified a Box command.
let decided = false;
const watchdog = setTimeout(() => {
  if (!decided) {
    decided = true;
    allow();
  }
}, 1500);

// Read the event from stdin, resolving on a short timer even if 'end' never fires (the Cursor
// harness leaves stdin open — the original hang). Data arrives immediately at spawn, so the
// timer only bounds the wait for a close that never comes.
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
    cmd = String(JSON.parse(raw || '{}').command || '');
  } catch {
    decided = true;
    clearTimeout(watchdog);
    return allow(); // unparseable event — not our concern
  }

  // Import the guard lib lazily so a slow/failed import can't hang module load.
  let lib;
  try {
    lib = await import('../../.claude/hooks/box-scope-lib.mjs');
  } catch {
    decided = true;
    clearTimeout(watchdog);
    return allow(); // can't load the guard — never block a command we can't classify
  }

  if (!cmd || !lib.isBoxCommand(cmd)) {
    decided = true;
    clearTimeout(watchdog);
    return allow(); // not a Box op — allow
  }

  // Positively identified as a Box op: from here we own the decision and FAIL CLOSED on any
  // problem. Cancel the watchdog so it can't allow this Box command behind our back.
  decided = true;
  clearTimeout(watchdog);
  try {
    const cfg = lib.loadConfig();
    if (cfg.liveReady) return deny('the retired liveReady production bypass is set; Box operations remain test-only.');
    if (cfg.mode !== 'test_only') {
      return deny(`tools/box-scope.json mode must remain test_only (got ${cfg.mode || 'missing'}).`);
    }
    if (cfg.allowedRoot !== TEST_ROOT) {
      return deny(`the Box test root is immutable (${TEST_ROOT}); configured root ${cfg.allowedRoot} is refused.`);
    }
    const root = cfg.allowedRoot;
    const allowed = new Set([root, ...cfg.allowedIds]);
    const a = lib.analyze(cmd);

    if (a.touchesFolderZero) {
      return deny(
        `command references Box folder 0 (All Files root). Only the test folder ${root} ` +
          `and its descendants are in scope.`,
      );
    }

    const bad = [...a.ids].filter((id) => !allowed.has(id));
    if (bad.length) {
      return deny(
        `Box id(s) [${bad.join(', ')}] are outside the test folder ${root}.\n` +
          `  In scope: root ${root} + ${cfg.allowedIds.length} tracked descendant id(s).\n` +
          `  A child created under the root is tracked automatically right after creation.\n` +
          `  No production bypass exists; TKT-178 requires a separate signed-run exact-object executor.`,
      );
    }

    if (a.webhookCreate) {
      const badTargets = a.webhookTargets.filter((t) => !allowed.has(t));
      if (a.webhookTargets.length === 0 || badTargets.length) {
        return deny(
          `a webhook may only target the test folder ${root} or a tracked descendant ` +
            `(got ${a.webhookTargets.join(', ') || 'no resolvable target'}). ` +
            `A webhook on any other folder — or with an id the guard can't see — could fire tenant-wide.`,
        );
      }
    }

    return allow(); // every referenced id is in scope
  } catch (e) {
    return deny(`could not validate this Box command, failing closed: ${e && e.message ? e.message : e}`);
  }
}

main();
