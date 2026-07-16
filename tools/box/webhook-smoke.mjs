// webhook-smoke.mjs — prove the Box-native path live, scoped to the test
// folder. Drives the box CLI (whatever identity is configured) under the allowlisted
// root only. Webhook -> the DEPLOYED box-webhook Function endpoint (no tunnel). Artifact
// ids are saved to .webhook-smoke-state.json so `cleanup` removes everything (mandatory teardown).
//
//   1) node tools/box/webhook-smoke.mjs setup --url https://<fn-host>/api/box-webhook?code=<key> [--template <fileRequestId>]
//   2) upload a file: via the printed File-Request URL (anonymous, the real unknown),
//      or:            node tools/box/webhook-smoke.mjs upload-control   # authenticated control
//   3) watch the Function App Insights traces for the receiver order + FILE.UPLOADED
//   4) node tools/box/webhook-smoke.mjs cleanup
//
// Webhook creation needs an identity with the manage_webhook scope (the CCG app once
// Admin-authorized; the personal Box CLI app may lack it — the error will say so).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(resolve(HERE, '..', 'box-scope.json'), 'utf8'));
const TEST_ROOT = '392761581105';
const ROOT = String(cfg.allowedRoot);
const allowedConfigKeys = new Set(['allowedRoot', 'allowedIds', 'mode', '_comment']);
if (Object.keys(cfg).some((key) => !allowedConfigKeys.has(key)) || cfg.mode !== 'test_only' || ROOT !== TEST_ROOT) {
  console.error('BLOCKED: Box live-test harness is permanently test-only; restore mode=test_only and root 392761581105.');
  process.exit(2);
}
const STATE = resolve(HERE, '.webhook-smoke-state.json');
const CHILD_NAME = 'CCPY26050';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function loadState() {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
}
function saveState(s) {
  writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
}
function box(args, { allowFail = false } = {}) {
  try {
    return execFileSync('box', args, { encoding: 'utf8' });
  } catch (e) {
    if (allowFail) return (e.stdout || '') + (e.stderr || '');
    console.error(`box ${args.join(' ')}\n${(e.stderr || e.stdout || e.message || '').slice(0, 600)}`);
    throw e;
  }
}
function jid(out) {
  try {
    const j = JSON.parse(out);
    return j.id || (j.entries && j.entries[0] && j.entries[0].id) || '';
  } catch {
    return '';
  }
}

const cmd = process.argv[2];

if (cmd === 'setup') {
  const url = arg('--url');
  const template = arg('--template');
  if (!url) {
    console.error('setup needs --url <publicUrl> (from run-receiver.mjs)');
    process.exit(1);
  }
  const s = loadState();

  // 1) ensure child folder under root (reuse on 409)
  let out = box(['folders:create', ROOT, CHILD_NAME, '--json'], { allowFail: true });
  let child = jid(out);
  if (!child) {
    // 409 -> find the existing child by name
    const items = box(['folders:items', ROOT, '--json', '--fields', 'id,name'], { allowFail: true });
    try {
      const arr = JSON.parse(items).entries || [];
      child = (arr.find((e) => e.name === CHILD_NAME) || {}).id || '';
    } catch {
      /* ignore */
    }
  }
  if (!child) {
    console.error('could not create or find the child folder under root.');
    process.exit(2);
  }
  s.childId = child;
  console.log(`child folder: ${child} (${CHILD_NAME} under ${ROOT})`);

  // 2) subscribe FILE.UPLOADED on the ROOT (recursive) -> public url
  const wout = box(['webhooks:create', ROOT, 'folder', '--address', url, '--triggers', 'FILE.UPLOADED', '--json'], { allowFail: true });
  const wid = jid(wout);
  if (wid) {
    s.webhookId = wid;
    console.log(`webhook ${wid} on root ${ROOT} -> ${url} (FILE.UPLOADED)`);
  } else {
    console.log('WEBHOOK NOT CREATED (identity may lack manage_webhook):');
    console.log(wout.slice(0, 400));
  }

  // 3) File-Request copy (the real anonymous-upload path) if a template is given
  if (template) {
    const frout = box(['file-requests:copy', template, '--folder-id', child, '--json'], { allowFail: true });
    const frid = jid(frout);
    let frUrl = '';
    try {
      frUrl = JSON.parse(frout).url || '';
    } catch {
      /* ignore */
    }
    if (frid) {
      s.fileRequestId = frid;
      console.log(`File Request ${frid} copied onto child. UPLOAD URL: ${frUrl || '(see Box UI)'}`);
      console.log('-> Upload a file via that URL (anonymous) — the REAL FILE.UPLOADED test.');
    } else {
      console.log('File-Request copy failed:');
      console.log(frout.slice(0, 400));
    }
  } else {
    console.log('No --template given. Use `upload-control` for an authenticated upload, or pass --template <fileRequestId>.');
  }
  saveState(s);
  console.log('\nNow upload, then watch tools/box/.sink-events.log for a FILE.UPLOADED line.');
} else if (cmd === 'upload-control') {
  const s = loadState();
  if (!s.childId) {
    console.error('run setup first.');
    process.exit(1);
  }
  const tmp = resolve(HERE, '.control-upload.txt');
  writeFileSync(tmp, `webhook smoke control upload ${ROOT}\n`);
  const out = box(['files:upload', tmp, '--parent-id', s.childId, '--json'], { allowFail: true });
  console.log(`control upload -> child ${s.childId}: file ${jid(out) || '(see output)'}`);
  console.log('A webhook on the root should now deliver FILE.UPLOADED for this child upload (tests recursion + firing).');
} else if (cmd === 'cleanup') {
  const s = loadState();
  if (s.fileRequestId) box(['file-requests:delete', s.fileRequestId, '--yes'], { allowFail: true });
  if (s.webhookId) box(['webhooks:delete', s.webhookId, '--yes'], { allowFail: true });
  if (s.childId) box(['folders:delete', s.childId, '--recursive', '--yes'], { allowFail: true });
  console.log('cleanup done (file-request, webhook, child folder removed). Verify root is empty:');
  console.log(box(['folders:items', ROOT, '--json', '--fields', 'id,name'], { allowFail: true }).slice(0, 400));
  writeFileSync(STATE, '{}\n');
} else {
  console.log('usage: webhook-smoke.mjs <setup --url <u> [--template <id>] | upload-control | cleanup>');
}
