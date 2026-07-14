// phaseA-probe.mjs — Phase A / Gate A: prove the Box CCG service-identity grant and
// reach into the test folder. Run via Infisical so client_id/secret arrive as env:
//   infisical run --env dev -- node tools/box/phaseA-probe.mjs [enterpriseId]
// Prints ONLY safe diagnostics — never the access token or client secret.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(resolve(HERE, '..', 'box-scope.json'), 'utf8'));
const TEST_ROOT = '392761581105';
const ALLOWED_ROOT = String(cfg.allowedRoot);

if (cfg.liveReady === true || cfg.mode !== 'test_only' || ALLOWED_ROOT !== TEST_ROOT) {
  console.error('BLOCKED: Box probe is permanently test-only; restore mode=test_only and root 392761581105.');
  process.exit(2);
}

const clientId = process.env.box_client_id || process.env.BOX_CLIENT_ID;
const clientSecret = process.env.box_client_secret || process.env.BOX_CLIENT_SECRET;
const enterpriseId = process.argv[2] || process.env.box_enterprise_id || '941197';

if (!clientId || !clientSecret) {
  console.error('FAIL: box_client_id / box_client_secret not in env (run via `infisical run --env dev --`).');
  process.exit(1);
}

function mask(id) {
  return id ? id.slice(0, 4) + '…(' + id.length + ')' : '(none)';
}

const main = async () => {
  console.log(`client_id ${mask(clientId)} · enterprise ${enterpriseId} · root ${ALLOWED_ROOT}`);

  // 1) CCG token mint (the exact grant the Function uses)
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    box_subject_type: 'enterprise',
    box_subject_id: enterpriseId,
  });
  const tok = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tj = await tok.json().catch(() => ({}));
  if (!tok.ok) {
    console.error(`FAIL token mint: HTTP ${tok.status} ${tj.error || ''} — ${tj.error_description || ''}`);
    if (tj.error === 'unauthorized_client' || tok.status === 401 || tok.status === 403) {
      console.error('  → OPERATOR STEP: authorize the Platform app in the Box Admin Console (Apps → App Manager).');
    }
    process.exit(2);
  }
  const token = tj.access_token;
  console.log(`CCG OK: token_type=${tj.token_type} expires_in=${tj.expires_in}s restricted_to=${(tj.restricted_to || []).length} scopes`);
  if (!token) {
    console.error('FAIL: no access_token in mint response.');
    process.exit(2);
  }

  // 2) Gate A: reach the test folder via the CCG token (scope-asserted)
  if (ALLOWED_ROOT === '0') {
    console.error('FAIL: refusing to probe folder 0.');
    process.exit(3);
  }
  const f = await fetch(
    `https://api.box.com/2.0/folders/${ALLOWED_ROOT}?fields=id,name,parent,item_collection`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const fj = await f.json().catch(() => ({}));
  if (!f.ok) {
    console.error(`FAIL folders:get ${ALLOWED_ROOT}: HTTP ${f.status} ${fj.code || ''} — ${fj.message || ''}`);
    if (f.status === 404) {
      console.error(
        '  → The CCG service account cannot see the test folder. One-time fix: collaborate ' +
          `folder ${ALLOWED_ROOT} to the service account (Editor), then re-run.`
      );
    }
    process.exit(4);
  }
  console.log(
    `GATE A PASS: folder ${fj.id} "${fj.name}" parent=${fj.parent ? fj.parent.id : 'none'} ` +
      `items=${fj.item_collection ? fj.item_collection.total_count : '?'} — CCG service account reaches the test folder.`
  );
};

main().catch((e) => {
  console.error('FAIL (unexpected):', e && e.message ? e.message : e);
  process.exit(9);
});
