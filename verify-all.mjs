#!/usr/bin/env node
/*
 * Aggregate OFFLINE verification gate for the collisionspike Phase 1 build.
 *
 *   Run:  node verify-all.mjs
 *
 * ZERO tenant / Azure / Power Platform / live-inbox contact. Pure local
 * build + test + lint over every live slice (the SPA in mockup-app/ + its
 * @cs/domain package, and the retained Python Azure Functions). This is the
 * [BUILD] gate from the Phase 1 plan §8.1/§8.5 — it must pass before any
 * [DEPLOY-WITH-LOGIN] step (the live deploy runbook is docs/azure/deploy.md).
 *
 * NOTE (post Power-Platform decommission, 2026-06-27): the Dataverse schema-parity,
 * Power-Automate flow-linter, and connector-seam gates are RETIRED to SKIP — their
 * targets were deleted in migration purge 5eac80e and the live SPA uses plain
 * REST+MSAL (see each gate below). The live Data API (api/) is now covered (tsc
 * build + vitest auth suite, gate 2b below); the orchestration/ TypeScript app is
 * not yet covered here — add it to extend live-stack coverage.
 *
 * Exit code 0 = all gates passed (skips allowed); nonzero = a gate failed.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const results = [];

function run(label, cmd, opts = {}) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    const out = execSync(cmd, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', shell: true });
    console.log(out.trim().split('\n').slice(-(opts.tail ?? 2)).join('\n'));
    results.push({ label, status: 'PASS' });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    console.log(out.trim().split('\n').slice(-(opts.tail ?? 8)).join('\n') || e.message);
    results.push({ label, status: 'FAIL' });
  }
}

function skip(label, why) {
  process.stdout.write(`\n=== ${label} ===\nSKIP — ${why}\n`);
  results.push({ label, status: 'SKIP' });
}

// In-process gate (no subprocess): runs `fn()`, which throws to FAIL with a
// message or returns a one-line PASS summary. Used for repo-static assertions
// that don't need a build/test runner.
function gate(label, fn) {
  process.stdout.write(`\n=== ${label} ===\n`);
  try {
    const summary = fn();
    console.log(summary || 'OK');
    results.push({ label, status: 'PASS' });
  } catch (e) {
    console.log(e.message || String(e));
    results.push({ label, status: 'FAIL' });
  }
}

// 1-2. Code App (React/Vite) — type-check + build, then the contract/domain/adapter unit tests.
run('Code App — tsc + vite build', 'npm run build', { cwd: join(ROOT, 'mockup-app'), tail: 1 });
run('Code App — vitest', 'npm run test', { cwd: join(ROOT, 'mockup-app'), tail: 3 });

// 2b. Live Data API (api/, Node/TS Functions v4 on cespk-api-dev) — tsc build then the
//     vitest auth suite (Entra JWT validation + app-role authz). `npm run build:api` also
//     builds its @cs/domain project reference, so this is the live Data API's offline gate.
run('Data API — tsc build', 'npm run build:api', { tail: 1 });
run('Data API — vitest (auth)', 'npm run test --workspace @cs/api', { tail: 3 });

// 2c. @cs/domain — the shared contract/codec/domain package the SPA + Data API both
//     import. Runs its vitest (incl. the choiceset<->TS-contract parity: case-status
//     option/terminal parity, EVA export field-order, codec bijection). This RE-ESTABLISHES
//     the parity coverage the retired Dataverse schema-parity gate (gate 3) used to give —
//     without it, an inconsistent edit to a relocated choiceset JSON would pass `verify-all`.
run('Domain — vitest (contract/codec/parity)', 'npm run test --workspace @cs/domain', { tail: 3 });

// 3. Dataverse schema-as-code — RETIRED. The Power Platform footprint (Dataverse +
//    Power Automate flows + Code App + connectors) was deprovisioned 2026-06-27 and
//    its in-repo artifacts (incl. dataverse/verify-parity.mjs) were deleted in the
//    migration purge (commit 5eac80e). The live system of record is Postgres
//    `cespk-pg-dev` (migration/assets/schema/), not Dataverse. SKIP, don't FAIL on a
//    target that was intentionally removed. (Linux/Windows-agnostic — the file is gone.)
const dvParity = join(ROOT, 'dataverse', 'verify-parity.mjs');
if (existsSync(dvParity)) run('Dataverse — schema parity', `node ${JSON.stringify(dvParity)}`, { tail: 1 });
else skip('Dataverse — schema parity', 'Power Platform decommissioned 2026-06-27; dataverse/verify-parity.mjs removed in migration purge 5eac80e. Live system-of-record is Postgres cespk-pg-dev.');

// 4. Power Automate flow definitions — RETIRED for the same reason: flows/ (incl.
//    validate-flows.mjs and every *.definition.json) was deleted in 5eac80e. The flow
//    logic was re-implemented in the api/ + orchestration/ TypeScript Functions.
const flowLint = join(ROOT, 'flows', 'validate-flows.mjs');
if (existsSync(flowLint)) run('Flows — definition linter', `node ${JSON.stringify(flowLint)}`, { tail: 1 });
else skip('Flows — definition linter', 'Power Platform decommissioned 2026-06-27; flows/ removed in migration purge 5eac80e. Flow logic now lives in api/ + orchestration/ TS Functions.');

// 5-6. Azure Functions — mocked-fixture pytest across EVERY built suite. venvs are
//      local + gitignored; a suite with no local .venv SKIPs (set it up to include
//      that gate). ocr lives at the repo root, not under functions/.
const PY_SUITES = [
  ['parser', join(ROOT, 'functions', 'parser'), 'functions/parser'],
  ['enrichment', join(ROOT, 'functions', 'enrichment'), 'functions/enrichment'],
  ['evasentry', join(ROOT, 'functions', 'evasentry'), 'functions/evasentry'],
  ['evavalidation', join(ROOT, 'functions', 'evavalidation'), 'functions/evavalidation'],
  ['location-suggest', join(ROOT, 'functions', 'location-suggest'), 'functions/location-suggest'],
  ['box-webhook', join(ROOT, 'functions', 'box-webhook'), 'functions/box-webhook'],
  ['ocr', join(ROOT, 'ocr'), 'ocr'],
];
for (const [name, dir, rel] of PY_SUITES) {
  const testsDir = join(dir, 'tests');
  if (!existsSync(testsDir)) { skip(`Function ${name} — pytest`, 'no tests dir'); continue; }
  const winPy = join(dir, '.venv', 'Scripts', 'python.exe');
  const nixPy = join(dir, '.venv', 'bin', 'python');
  const exe = isWin && existsSync(winPy) ? winPy : existsSync(nixPy) ? nixPy : null;
  if (exe) {
    run(`Function ${name} — pytest`, `${JSON.stringify(exe)} -m pytest tests -q`, { tail: 1, cwd: dir });
  } else {
    skip(`Function ${name} — pytest`, `no .venv. Setup: cd ${rel} && python -m venv .venv && (.venv/Scripts or .venv/bin)/pip install -r requirements.txt -r requirements-dev.txt`);
  }
}

// 7. Generated-service hand-edit guard — RETIRED. This guarded a pac-generator
//    regression (a non-compiling `client.uploadFileToRecord(` call) in the Code App's
//    mockup-app/src/generated/ Dataverse services. The Power Platform Code App was
//    decommissioned 2026-06-27 and that directory no longer exists — the live SPA on
//    cespk-spa-dev calls the Data API over plain REST + MSAL (no pac-generated services).
//    With nothing left to scan the gate was a vacuous PASS, so SKIP it like the sibling
//    Power-Platform gates 3/4/8 rather than report a hollow pass over zero files.
skip(
  'Code App — no uploadFileToRecord in generated services',
  'Power Platform Code App decommissioned 2026-06-27; mockup-app/src/generated/ removed. The live SPA uses plain REST+MSAL (no pac-generated services), so there is nothing to scan.',
);

// 8. Connector-seam boundary gate — RETIRED. This gate enforced the Power Platform
//    Code App's CSP `connect-src 'none'` invariant: the app could only reach external
//    services through the @microsoft/power-apps connector seam, never a raw fetch/XHR
//    (AGENTS.md runtime-truth #1, now banded HISTORICAL). The live SPA on Static Web App
//    `cespk-spa-dev` instead calls the Data API over PLAIN REST + MSAL (no Power SDK, no
//    connectors) — so `fetch()` in rest-client.ts / screens / msalConfig.ts is now the
//    EXPECTED, correct transport, and this gate's NEEDLES (fetch, login.microsoftonline,
//    …) flag legitimate code. The live boundary is CORS on cespk-api-dev + the SWA origin
//    plus MSAL bearer-token attachment, verified against the deployed stack, not by this
//    static check. SKIP rather than fail-on-correct-architecture.
skip(
  'Code App — no raw external calls outside the connector seam',
  'superseded by the REST+MSAL architecture: the Power Platform connector seam was decommissioned 2026-06-27; the live SPA fetches the Data API directly (AGENTS.md runtime-truth #1, banded HISTORICAL). The live boundary is CORS + MSAL on cespk-api-dev, not a static fetch-ban.',
);

// 9. ====================  VERIFY-LIVE GATE  ====================================
//
//  PURPOSE. Catch documentation drift at its SOURCE: the registry LIVE_FACTS.json
//  is the single source of live numbers (function counts, Graph subscriptions,
//  per-mailbox RBAC, feature gates, httpsOnly). This gate re-queries the live
//  Azure/Graph control plane READ-ONLY and FAILS if reality has drifted from what
//  LIVE_FACTS.json records — i.e. the registry (and every doc that links it) is stale.
//  Run it after any live Azure change, then bump LIVE_FACTS.lastVerified.
//
//  OFFLINE-SAFE (this is the whole point — `node verify-all.mjs` stays green offline).
//  The gate SKIPS cleanly — exactly like the retired Power-Platform gates above —
//  unless BOTH:
//     (1) env  VERIFY_LIVE=1   is set (opt-in), AND
//     (2) preflight `az account show` succeeds (a live Azure login exists).
//  With neither, it records a SKIP and never touches the network. This mirrors the
//  existsSync()-guards on gates 3/4: never FAIL on an intentionally-absent target.
//
//  ENTRIES. For every LIVE_FACTS entry with `verified: true` it re-checks and diffs:
//     - functionCounts      → az functionapp function list --query 'length(@)'
//     - graphSubscriptions  → app-only token → GET /v1.0/subscriptions  (count + mailbox set;
//                             expirationDateTime is NOT diffed — it moves on every renewal)
//     - mailboxRbac         → app-only token → GET /v1.0/users/<mbx>/messages?$top=1 (200/403)
//     - gates               → az functionapp config appsettings list (BOX_*/EVA_*/ENRICHMENT/…)
//     - httpsOnly           → az resource show --query properties.httpsOnly
//  Entries with `verified: false` (e.g. postgresCounts — PG firewall blocked the snapshot)
//  are SKIPPED, never failed. boxSmoke/resourceInventory/csvComparison/subscriptionRenewalRisk
//  are point-in-time observations, not drift-gated here (noted as SKIP-not-gated).
//
//  SECRETS. The Graph app-only token is minted from KV secret
//  cespk-pg-kv-dev/graph-client-secret (client 5d37a155-…, tenant 858cf5b3-…). The secret
//  and the bearer token are NEVER printed — they live only in local vars and the POST body.
//  az keyvault output is captured by execSync (into a JS string), not echoed.
//
{
  const LIVE = () => JSON.parse(readFileSync(join(ROOT, 'LIVE_FACTS.json'), 'utf8'));
  const GRAPH_CLIENT_ID = '5d37a155-2af8-4878-b96a-6faad5207137';
  const TENANT_ID = '858cf5b3-aa0a-47a6-9b40-4851fd0afa94';
  const KV_NAME = 'cespk-pg-kv-dev';
  const KV_SECRET = 'graph-client-secret';

  const liveResult = (label, status, detail) => {
    process.stdout.write(`\n=== ${label} ===\n${status}${detail ? ' — ' + detail : ''}\n`);
    results.push({ label, status });
  };
  // execSync wrapper that returns trimmed stdout or null on failure (never throws).
  const sh = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };

  if (process.env.VERIFY_LIVE !== '1') {
    skip('verify-live — registry drift', 'set VERIFY_LIVE=1 to re-query live Azure/Graph and diff vs LIVE_FACTS.json (offline default).');
  } else if (sh('az account show -o none') === null) {
    skip('verify-live — registry drift', 'VERIFY_LIVE=1 but no live Azure login (`az account show` failed). Run `az login`, then re-run.');
  } else {
    // ---- live mode: collect drift across all verified:true entries ----
    const facts = LIVE();
    const RG = facts.resourceGroup || 'rg-collisionspike-dev';
    const drift = []; // { fact, expected, actual }

    // (a) function counts
    if (facts.functionCounts?.verified) {
      for (const [app, expected] of Object.entries(facts.functionCounts.value)) {
        const appName = app === 'orch' ? 'cespk-orch-dev' : app === 'api' ? 'cespk-api-dev' : app;
        const out = sh(`az functionapp function list -g ${RG} -n ${appName} --query "length(@)" -o tsv`);
        const actual = out === null ? null : Number(out);
        if (actual !== expected) drift.push({ fact: `functionCounts.${app}`, expected, actual });
      }
    }

    // (b)+(c) Graph: mint app-only token (secret never printed), then subscriptions + mailbox RBAC.
    const needGraph = facts.graphSubscriptions?.verified || facts.mailboxRbac?.verified;
    let token = null;
    if (needGraph) {
      const secret = sh(`az keyvault secret show --vault-name ${KV_NAME} --name ${KV_SECRET} --query value -o tsv`);
      if (!secret) {
        drift.push({ fact: 'graph-token', expected: 'token mintable', actual: 'KV secret unavailable' });
      } else {
        try {
          const body = new URLSearchParams({
            client_id: GRAPH_CLIENT_ID,
            client_secret: secret,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
          });
          const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body,
          });
          if (r.ok) token = (await r.json()).access_token;
          else drift.push({ fact: 'graph-token', expected: 'HTTP 200', actual: `HTTP ${r.status}` });
        } catch (e) {
          drift.push({ fact: 'graph-token', expected: 'token mint OK', actual: 'network error' });
        }
      }
    }
    const graphGet = async (url) => {
      const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      return r;
    };

    // (b) Graph subscriptions — diff COUNT + mailbox set (not expiration: it renews).
    if (token && facts.graphSubscriptions?.verified) {
      try {
        const r = await graphGet('https://graph.microsoft.com/v1.0/subscriptions');
        const subs = r.ok ? (await r.json()).value || [] : [];
        const expectedCount = facts.graphSubscriptions.value.length;
        if (subs.length !== expectedCount) {
          drift.push({ fact: 'graphSubscriptions.count', expected: expectedCount, actual: subs.length });
        }
        const mbxOf = (res) => (res.match(/users\/([^/]+)/) || [])[1] || res;
        const expectedMbx = new Set(facts.graphSubscriptions.value.map((s) => mbxOf(s.resource)));
        const actualMbx = new Set(subs.map((s) => mbxOf(s.resource || '')));
        for (const m of expectedMbx) if (!actualMbx.has(m)) drift.push({ fact: 'graphSubscriptions.mailbox', expected: m, actual: 'absent' });
      } catch {
        drift.push({ fact: 'graphSubscriptions', expected: 'queryable', actual: 'network error' });
      }
    }

    // (c) mailbox RBAC — per-mailbox 200/403 (token absent ⇒ cannot verify ⇒ drift flag).
    if (facts.mailboxRbac?.verified) {
      for (const [mbx, exp] of Object.entries(facts.mailboxRbac.value)) {
        let status = null;
        if (token) {
          try {
            const r = await graphGet(`https://graph.microsoft.com/v1.0/users/${mbx}/messages?$top=1`);
            status = r.status;
          } catch {
            status = null;
          }
        }
        if (status !== exp.http) drift.push({ fact: `mailboxRbac.${mbx}`, expected: exp.http, actual: status });
      }
    }

    // (d) gates — compare each recorded app-setting; LIVE_FACTS "(absent)" ⇒ unset.
    if (facts.gates?.verified) {
      for (const [appName, gates] of Object.entries(facts.gates.value)) {
        const raw = sh(`az functionapp config appsettings list -g ${RG} -n ${appName} -o json`);
        let settings = {};
        if (raw) {
          try {
            for (const kv of JSON.parse(raw)) settings[kv.name] = kv.value;
          } catch {
            /* leave empty → flagged below */
          }
        }
        for (const [name, expected] of Object.entries(gates)) {
          const actual = name in settings ? settings[name] : '(absent)';
          if (actual !== expected) drift.push({ fact: `gates.${appName}.${name}`, expected, actual });
        }
      }
    }

    // (e) httpsOnly — per-app boolean.
    if (facts.httpsOnly?.verified) {
      for (const [appName, expected] of Object.entries(facts.httpsOnly.value)) {
        const out = sh(`az resource show -g ${RG} -n ${appName} --resource-type Microsoft.Web/sites --query properties.httpsOnly -o tsv`);
        const actual = out === null ? null : out === 'true';
        if (actual !== expected) drift.push({ fact: `httpsOnly.${appName}`, expected, actual });
      }
    }

    if (drift.length === 0) {
      liveResult('verify-live — registry drift', 'PASS', `LIVE_FACTS.json matches live (verified at ${facts.lastVerified}).`);
    } else {
      process.stdout.write('\n=== verify-live — registry drift ===\nFAIL — live reality has drifted from LIVE_FACTS.json:\n');
      for (const d of drift) {
        console.log(`  ${d.fact}: registry=${JSON.stringify(d.expected)}  live=${JSON.stringify(d.actual)}`);
      }
      console.log('  → Re-verify, update LIVE_FACTS.json + docs/architecture/live-environment.md, bump lastVerified.');
      results.push({ label: 'verify-live — registry drift', status: 'FAIL' });
    }
  }
}

// Summary -------------------------------------------------------------------
console.log('\n================ SUMMARY ================');
for (const r of results) console.log(`  ${r.status.padEnd(4)}  ${r.label}`);
const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');
console.log(`\n${failed.length === 0 ? 'OK' : 'FAILED'} — ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped.`);
if (skipped.length) console.log('(skips: retired Power-Platform gates — Dataverse/Flows targets deleted in migration purge 5eac80e, and the connector-seam + generated-service gates superseded by the live REST+MSAL SPA. A Python Function suite also SKIPs if its local .venv is absent — set it up to include that gate.)');
process.exit(failed.length === 0 ? 0 : 1);
