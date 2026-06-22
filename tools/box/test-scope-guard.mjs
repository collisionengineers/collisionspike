// test-scope-guard.mjs — Gate 0 verification for the Box scope guard.
// Spawns the real PreToolUse guard and PostToolUse grower against representative
// payloads and asserts deny/allow + allowlist growth. Restores tools/box-scope.json
// to its pre-test state. Run: node tools/box/test-scope-guard.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/box
const ROOT = resolve(HERE, '..', '..');
const GUARD = resolve(ROOT, '.claude', 'hooks', 'box-scope-guard.mjs');
const POST = resolve(ROOT, '.claude', 'hooks', 'box-scope-postcreate.mjs');
const CONFIG = resolve(ROOT, 'tools', 'box-scope.json');
const TEST_ROOT = '392761581105';

const snapshot = readFileSync(CONFIG, 'utf8'); // restore after
let pass = 0;
let fail = 0;
const fails = [];

function run(script, ev) {
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(ev), encoding: 'utf8' });
  return { code: r.status, err: r.stderr || '' };
}
function bash(command) {
  return { tool_name: 'Bash', tool_input: { command } };
}
function expect(label, got, want) {
  if (got === want) {
    pass++;
  } else {
    fail++;
    fails.push(`${label}: expected ${want}, got ${got}`);
  }
}

// ---- PreToolUse guard: DENY cases (exit 2) ----
const deny = [
  ['folder 0', 'box folders:get 0'],
  ['create under out-of-scope parent', `box folders:create 999999 CCPY26050`],
  ['get out-of-scope id', 'box folders:items 123456789'],
  ['REST out-of-scope', 'curl -s https://api.box.com/2.0/folders/55555/items'],
  ['webhook off-root target (flag)', 'box webhooks:create --target-id 777777 --target-type folder --address https://x/api/box-webhook --triggers FILE.UPLOADED'],
  ['webhook off-root target (positional)', 'box webhooks:create 777777 folder --address https://x/api/box-webhook --triggers FILE.UPLOADED'],
  ['webhook no resolvable target', 'box webhooks:create --address https://x/api/box-webhook --triggers FILE.UPLOADED'],
  ['parent-id 0 flag', 'box files:upload ./a.jpg --parent-id 0'],
];
for (const [label, cmd] of deny) expect(`DENY ${label}`, run(GUARD, bash(cmd)).code, 2);

// ---- PreToolUse guard: ALLOW cases (exit 0) ----
const allow = [
  ['get root', `box folders:get ${TEST_ROOT}`],
  ['create under root', `box folders:create ${TEST_ROOT} CCPY26050`],
  ['webhook on root (flag)', `box webhooks:create --target-id ${TEST_ROOT} --target-type folder --address https://x/api/box-webhook --triggers FILE.UPLOADED`],
  ['webhook on root (positional)', `box webhooks:create ${TEST_ROOT} folder --address https://x/api/box-webhook --triggers FILE.UPLOADED`],
  ['webhooks:create --help', 'box webhooks:create --help'],
  ['file-requests --help', 'box file-requests --help'],
  ['non-box npm', 'npm run build'],
  ['non-box repo path', 'grep -r foo functions/box-webhook/'],
  ['non-box cat', 'cat box-integration-pivot/README.md'],
];
for (const [label, cmd] of allow) expect(`ALLOW ${label}`, run(GUARD, bash(cmd)).code, 0);

// ---- PostToolUse grower: appends a child created under root ----
const childId = '555000111222';
run(POST, {
  tool_name: 'Bash',
  tool_input: { command: `box folders:create ${TEST_ROOT} CCPY26050 --json` },
  tool_response: { stdout: JSON.stringify({ type: 'folder', id: childId, parent: { id: TEST_ROOT } }) },
});
let cfgNow = JSON.parse(readFileSync(CONFIG, 'utf8'));
expect('GROW tracks in-scope child', cfgNow.allowedIds.includes(childId), true);

// child is now allowlisted -> guard allows ops on it
expect('ALLOW op on tracked child', run(GUARD, bash(`box folders:items ${childId}`)).code, 0);

// ---- PostToolUse grower: refuses a child hanging off an out-of-scope parent ----
const orphanId = '888000111222';
run(POST, {
  tool_name: 'Bash',
  tool_input: { command: 'box folders:create 999999 X --json' },
  tool_response: { stdout: JSON.stringify({ type: 'folder', id: orphanId, parent: { id: '999999' } }) },
});
cfgNow = JSON.parse(readFileSync(CONFIG, 'utf8'));
expect('GROW refuses out-of-scope child', cfgNow.allowedIds.includes(orphanId), false);

// ---- restore pristine config ----
writeFileSync(CONFIG, snapshot);

console.log(`\nbox-scope-guard: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log(fails.map((f) => '  FAIL ' + f).join('\n'));
  process.exit(1);
}
console.log('GATE 0 PASS — out-of-scope Box ops blocked; root + tracked children allowed; allowlist grows downward only.');
