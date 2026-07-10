/**
 * TKT-140 drain phase — drive the EXISTING keyed `POST /api/retro-case` starter
 * (cespk-orch-dev) over the 99 drainable rows from the dry-run enumeration, per
 * the operator-authorized dry-run recommendation (evidence/dryrun-summary.md).
 *
 * Scope guard (computed, not hand-listed): a row is drained iff ≥1 of its keys is
 * `recommendedForDrain` in dryrun-ledger.jsonl — i.e. trustworthy-locatable or
 * rung-1-linkable. The 12 junk-noise-only + 6 unlocatable-only + 1 mixed rows are
 * WITHHELD. The 13 highNoise keys are never the reason a row drains.
 *
 * Mechanism: existing seams only — the ladder (resolve-existing → [box skipped:
 * no archive roots] → outlook → persist/record-failure) runs server-side with all
 * mint guards; this driver only starts instances and awaits their terminal state
 * via the durable status endpoint. NO Graph writes, NO mailbox mutations.
 *
 * Pacing: batches of 10, sequential WITHIN batch (await terminal before the next
 * start), ~5s between starts. Circuit breaker: a batch with >10% hard errors
 * (HTTP failure / Failed / Terminated / timeout / gate-skip) aborts the run.
 * Resumable: rows with a terminal ledger entry are skipped on re-run; the starter
 * itself dedupes on instanceId retro-<messageId>.
 *
 * Usage:
 *   ORCH_FN_KEY_FILE=<key file> [PILOT_ONLY=1] node drive-drain.mjs
 * Durable management URLs embed a system key -> they are kept ONLY in a
 * scratchpad state file (MGMT_STATE_FILE or alongside the key file), never in
 * the committed ledger.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVID = dirname(fileURLToPath(import.meta.url));
const START_URL = 'https://cespk-orch-dev.azurewebsites.net/api/retro-case';
const BATCH_SIZE = 10;
const START_PAUSE_MS = 5_000;
const POLL_MS = 5_000;
const ROW_TIMEOUT_MS = 8 * 60_000;
const BATCH_ERROR_RATE_ABORT = 0.10; // strictly greater-than aborts

const keyFile = process.env.ORCH_FN_KEY_FILE;
if (!keyFile || !existsSync(keyFile)) { console.error('ORCH_FN_KEY_FILE required'); process.exit(2); }
const FN_KEY = readFileSync(keyFile, 'utf8').trim();
const MGMT_STATE = process.env.MGMT_STATE_FILE ?? join(dirname(keyFile), 'drain-mgmt-template.txt');
const PILOT_ONLY = process.env.PILOT_ONLY === '1';

const LEDGER = join(EVID, 'drain-ledger.jsonl');
const LOG = join(EVID, 'drain-run-log.txt');
const log = (m) => { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); appendFileSync(LOG, l + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- CSV parser (same as drive-probe.mjs) ---------- */
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length > 0) { row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

/* ---------- load dry-run artifacts ---------- */
const keyLedger = new Map(
  readFileSync(join(EVID, 'dryrun-ledger.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).map((r) => [r.key, r]),
);
const csv = parseCsv(readFileSync(join(EVID, 'enum-backlog-rows.csv'), 'utf8'));
const h = csv[0]; const col = (n) => h.indexOf(n);
const rows = csv.slice(1).map((r) => ({
  id: r[col('id')],
  messageId: r[col('source_message_id')],
  mailbox: r[col('source_mailbox')],
  receivedOn: r[col('received_on')],
  category: r[col('category')], subtype: r[col('subtype')],
  subject: r[col('subject')],
  keys: [r[col('key_case_po')], r[col('key_external_ref')], r[col('key_vrm')]].filter(Boolean),
}));

const flag = (k) => keyLedger.get(k);
const drainable = rows.filter((r) => r.keys.some((k) => flag(k)?.recommendedForDrain));
const withheld = rows.filter((r) => !r.keys.some((k) => flag(k)?.recommendedForDrain));
const inBand = (r) => r.keys.some((k) => {
  const f = flag(k);
  return f?.probed && f.locatable && !f.highNoise && f.wholeMailboxHits >= 1 && f.wholeMailboxHits <= 3;
});
// Pilot-first deterministic order: 1-3-hit-band rows (oldest first), then the rest (oldest first).
const pilotPool = drainable.filter(inBand).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
const restPool = drainable.filter((r) => !inBand(r)).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
const ordered = [...pilotPool, ...restPool];
log(`rows: eligible=${rows.length} drainable=${drainable.length} withheld=${withheld.length} pilot-band=${pilotPool.length} ${PILOT_ONLY ? '(PILOT_ONLY: first batch then stop)' : ''}`);
if (drainable.length !== 99) log(`NOTE: drainable=${drainable.length} (dry-run computed 99) — proceeding with the computed set`);

/* ---------- resume state ---------- */
const done = new Map();
if (existsSync(LEDGER)) {
  for (const line of readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    if (e.terminal) done.set(e.messageId, e);
  }
  log(`resume: ${done.size} rows already terminal in ledger`);
}
let mgmtTemplate = existsSync(MGMT_STATE) ? readFileSync(MGMT_STATE, 'utf8').trim() : '';

/* ---------- durable status ---------- */
function mgmtUrlFor(instanceId) {
  if (!mgmtTemplate) return null;
  return mgmtTemplate.replace('__INSTANCE__', encodeURIComponent(instanceId));
}
async function getStatus(instanceId) {
  const url = mgmtUrlFor(instanceId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return { httpStatus: res.status };
  return await res.json();
}

/* ---------- one row ---------- */
async function drainRow(row, batchNo, seq) {
  const started = Date.now();
  const entry = {
    ts: new Date().toISOString(), seq, batch: batchNo,
    inboundId: row.id, messageId: row.messageId, mailbox: row.mailbox,
    keys: row.keys, category: `${row.category}/${row.subtype}`,
    instanceId: null, httpStatus: null, runtimeStatus: null,
    outcome: null, caseId: null, casePo: null, reasons: null,
    durationMs: null, terminal: false, error: null, hardError: false,
  };
  try {
    const res = await fetch(START_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-functions-key': FN_KEY },
      body: JSON.stringify({ internetMessageId: row.messageId, mailbox: row.mailbox }),
    });
    entry.httpStatus = res.status;
    if (res.status === 401 || res.status === 403) throw new Error(`auth ${res.status} — aborting run`);
    const body = await res.json().catch(() => ({}));
    if (body.skipped) { entry.error = `starter skipped: ${body.reason ?? 'gate off'}`; entry.hardError = true; entry.terminal = true; return entry; }
    entry.instanceId = body.instanceId ?? body.id ?? null;
    if (res.status === 202 && body.statusQueryGetUri && !mgmtTemplate) {
      mgmtTemplate = String(body.statusQueryGetUri).replace(encodeURIComponent(entry.instanceId), '__INSTANCE__').replace(entry.instanceId, '__INSTANCE__');
      writeFileSync(MGMT_STATE, mgmtTemplate);
      log('durable mgmt URL template captured (scratchpad only)');
    }
    if (!entry.instanceId) { entry.error = `no instance id (http ${res.status})`; entry.hardError = true; entry.terminal = true; return entry; }
    if (body.deduped) log(`row ${seq}: instance ${entry.instanceId} deduped (${body.runtimeStatus})`);

    // await terminal
    while (Date.now() - started < ROW_TIMEOUT_MS) {
      const st = await getStatus(entry.instanceId);
      if (st && st.runtimeStatus) {
        entry.runtimeStatus = st.runtimeStatus;
        if (['Completed', 'Failed', 'Terminated'].includes(st.runtimeStatus)) {
          entry.terminal = true;
          if (st.runtimeStatus === 'Completed') {
            const out = st.output ?? {};
            entry.outcome = out.outcome ?? null;
            entry.caseId = out.caseId ?? null;
            entry.casePo = out.casePo ?? null;
            entry.reasons = out.reasons ?? out.reason ?? null;
          } else {
            entry.error = `runtime ${st.runtimeStatus}`;
            entry.hardError = true;
          }
          break;
        }
      } else if (st && st.httpStatus && st.httpStatus !== 202 && st.httpStatus !== 404) {
        log(`row ${seq}: status poll http ${st.httpStatus}`);
      }
      await sleep(POLL_MS);
    }
    if (!entry.terminal) { entry.error = `timeout after ${ROW_TIMEOUT_MS}ms (still ${entry.runtimeStatus ?? 'unknown'})`; entry.hardError = true; entry.terminal = true; entry.runtimeStatus = entry.runtimeStatus ?? 'TimeoutUnknown'; }
  } catch (e) {
    entry.error = String(e); entry.hardError = true; entry.terminal = true;
    if (String(e).includes('aborting run')) { appendFileSync(LEDGER, JSON.stringify({ ...entry, durationMs: Date.now() - started }) + '\n'); throw e; }
  }
  entry.durationMs = Date.now() - started;
  return entry;
}

/* ---------- batches ---------- */
const batches = [];
for (let i = 0; i < ordered.length; i += BATCH_SIZE) batches.push(ordered.slice(i, i + BATCH_SIZE));
let seq = 0;
const tally = { created: 0, linked: 0, already_exists_linked: 0, no_source: 0, not_eligible: 0, ambiguous: 0, trigger_not_found: 0, other: 0, errors: 0, skippedResume: 0 };

for (let b = 0; b < batches.length; b++) {
  const batch = batches[b];
  let batchErrors = 0, batchRun = 0;
  log(`=== batch ${b + 1}/${batches.length} (${batch.length} rows) ===`);
  for (const row of batch) {
    seq++;
    if (done.has(row.messageId)) { tally.skippedResume++; continue; }
    const entry = await drainRow(row, b + 1, seq);
    appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
    done.set(row.messageId, entry);
    batchRun++;
    if (entry.hardError) { batchErrors++; tally.errors++; log(`row ${seq} ERROR: ${entry.error}`); }
    else {
      const o = entry.outcome ?? 'other';
      tally[o] = (tally[o] ?? 0) + 1;
      log(`row ${seq} ${entry.runtimeStatus} outcome=${o}${entry.caseId ? ' case=' + entry.caseId : ''}${entry.reasons ? ' reasons=' + JSON.stringify(entry.reasons) : ''} (${Math.round(entry.durationMs / 1000)}s)`);
    }
    await sleep(START_PAUSE_MS);
  }
  if (batchRun > 0 && batchErrors / batchRun > BATCH_ERROR_RATE_ABORT) {
    writeFileSync(join(EVID, 'drain-aborted.flag'), `batch ${b + 1} error rate ${batchErrors}/${batchRun}`);
    log(`ABORT: batch ${b + 1} error rate ${batchErrors}/${batchRun} exceeds ${BATCH_ERROR_RATE_ABORT * 100}%`);
    process.exit(3);
  }
  log(`batch ${b + 1} done: errors ${batchErrors}/${batchRun}; cumulative ${JSON.stringify(tally)}`);
  if (PILOT_ONLY && b === 0) { log('PILOT_DONE — stopping for outcome review (re-run without PILOT_ONLY to continue)'); process.exit(0); }
}
log(`DRAIN COMPLETE: ${JSON.stringify(tally)}`);
