/**
 * TKT-140 dry-run — drive the READ-ONLY `POST /api/retro-deleted-probe` route
 * (cespk-orch-dev) over the enumerated un-cased backlog keys, and build the
 * per-key dry-run ledger. NO writes anywhere: the probe is folder-property +
 * $search reads only; this driver only reads enum-backlog-keys.csv and writes
 * local evidence files.
 *
 * Usage (Windows node, per docs/azure/README.md platform routing):
 *   ORCH_FN_KEY_FILE=<path-to-key-file> node drive-probe.mjs
 * The function key is sourced via `az functionapp keys list` into a scratchpad
 * file OUTSIDE the repo (never hardcoded, never committed, never echoed).
 *
 * Paging/pacing (delegation brief): <=10 variant-keys per call (the route caps
 * at 25; 10 keeps each invocation ~60 Graph reads, well inside the 230s HTTP
 * window), ~1.5s pause between calls, backoff+retry on 429/5xx, abort if the
 * call error rate exceeds 5%.
 *
 * Variant fidelity: each key is expanded with refSearchVariants() EXACTLY as
 * the live retroOutlookLocate rung does (orchestration/src/lib/retro-envelope.ts,
 * TKT-139) — compact + spaced-at-alpha/digit-boundaries, deduped — and hits are
 * unioned per parent key, so "locatable" here means locatable BY THE LIVE LADDER.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVID = dirname(fileURLToPath(import.meta.url));
const PROBE_URL = 'https://cespk-orch-dev.azurewebsites.net/api/retro-deleted-probe';
const PAGE_SIZE = 10;
const PAUSE_MS = 1500;
const ERROR_RATE_ABORT = 0.05;

const keyFile = process.env.ORCH_FN_KEY_FILE;
if (!keyFile || !existsSync(keyFile)) {
  console.error('ORCH_FN_KEY_FILE env var must point at the function-key file (scratchpad).');
  process.exit(2);
}
const FN_KEY = readFileSync(keyFile, 'utf8').trim();
if (!FN_KEY) { console.error('empty function key'); process.exit(2); }

/* ---------- exact port of orchestration/src/lib/retro-envelope.ts refSearchVariants ---------- */
function refSearchVariants(key) {
  const given = String(key ?? '').replace(/\s+/g, ' ').trim();
  if (!given) return [];
  const compact = given.replace(/\s+/g, '');
  const spaced = compact
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
  const out = [];
  for (const v of [given, compact, spaced]) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/* ---------- minimal RFC4180 CSV parser (quoted fields, embedded commas/newlines) ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(EVID, 'probe-run-log.txt'), line + '\n');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- load enumeration, merge kinds per key string, split cased/un-cased ---------- */
const csv = parseCsv(readFileSync(join(EVID, 'enum-backlog-keys.csv'), 'utf8'));
const header = csv[0];
const col = (name) => header.indexOf(name);
const keys = new Map(); // key string -> merged record
for (const r of csv.slice(1)) {
  const key = r[col('key')];
  if (!key) continue;
  const rec = keys.get(key) ?? {
    key, kinds: new Set(), rowCount: 0, categories: new Set(), mailboxesObserved: new Set(),
    earliest: r[col('earliest_received')], latest: r[col('latest_received')],
    sampleSubject: r[col('sample_subject')], r1Exact: false, r1Loose: false,
  };
  rec.kinds.add(r[col('kind')]);
  rec.rowCount += Number(r[col('row_count')] || 0);
  for (const c of (r[col('categories')] || '').split('; ')) if (c) rec.categories.add(c);
  for (const m of (r[col('mailboxes_observed')] || '').split('; ')) if (m) rec.mailboxesObserved.add(m);
  if (r[col('earliest_received')] < rec.earliest) rec.earliest = r[col('earliest_received')];
  if (r[col('latest_received')] > rec.latest) rec.latest = r[col('latest_received')];
  rec.r1Exact = rec.r1Exact || r[col('r1_match_exact')] === 't';
  rec.r1Loose = rec.r1Loose || r[col('r1_match_loose')] === 't';
  keys.set(key, rec);
}
const all = [...keys.values()];
const backlog = all.filter((k) => !k.r1Loose);   // un-cased -> probe these
const linkOnly = all.filter((k) => k.r1Loose);   // a case already exists -> rung 1 would LINK
log(`enumerated key strings: ${all.length} (backlog to probe: ${backlog.length}; would-link-at-R1: ${linkOnly.length})`);

/* ---------- build the variant probe list ---------- */
const variantToParent = new Map();
const variantList = [];
for (const k of backlog) {
  k.variants = refSearchVariants(k.key);
  for (const v of k.variants) {
    if (!variantToParent.has(v)) { variantToParent.set(v, []); variantList.push(v); }
    variantToParent.get(v).push(k.key);
  }
}
log(`variant strings to probe: ${variantList.length} (page size ${PAGE_SIZE})`);

/* ---------- drive the probe ---------- */
const pages = [];
for (let i = 0; i < variantList.length; i += PAGE_SIZE) pages.push(variantList.slice(i, i + PAGE_SIZE));

const hits = new Map(); // variant -> { perMailbox: { [mbx]: {deleted, whole} } }
const mailboxMeta = new Map(); // mailbox -> {deletedTotal, inboxTotal}
const samples = new Map(); // variant -> [{mailbox, subject, receivedDateTime}]
let calls = 0, callErrors = 0, mailboxErrors = 0;

const rawPath = join(EVID, 'probe-raw.jsonl');
writeFileSync(rawPath, '');

for (let p = 0; p < pages.length; p++) {
  const page = pages[p];
  let attempt = 0, done = false;
  while (!done) {
    attempt++;
    calls++;
    let status = 0, body = null, err = null;
    try {
      const res = await fetch(PROBE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-functions-key': FN_KEY },
        body: JSON.stringify({ keys: page }),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      err = String(e);
    }
    if (status === 200 && body && Array.isArray(body.mailboxes)) {
      appendFileSync(rawPath, JSON.stringify({ page: p + 1, of: pages.length, request: { keys: page }, status, body }) + '\n');
      for (const mb of body.mailboxes) {
        if (mb.error) { mailboxErrors++; log(`page ${p + 1}: mailbox ${mb.mailbox} error: ${mb.error}`); continue; }
        mailboxMeta.set(mb.mailbox, { deletedTotal: mb.deletedTotalItemCount, inboxTotal: mb.inboxTotalItemCount });
        for (const kp of mb.keys ?? []) {
          const h = hits.get(kp.key) ?? { perMailbox: {} };
          h.perMailbox[mb.mailbox] = { deleted: kp.deletedScopeHits, whole: kp.wholeMailboxHits };
          hits.set(kp.key, h);
          if ((kp.sample ?? []).length > 0) {
            const s = samples.get(kp.key) ?? [];
            for (const smp of kp.sample) s.push({ mailbox: mb.mailbox, ...smp });
            samples.set(kp.key, s);
          }
        }
      }
      log(`page ${p + 1}/${pages.length} OK (${page.length} variants)`);
      done = true;
    } else {
      callErrors++;
      log(`page ${p + 1}/${pages.length} attempt ${attempt} FAILED status=${status} err=${err ?? (body ? JSON.stringify(body).slice(0, 200) : 'no body')}`);
      if (attempt >= 3) { log(`page ${p + 1} giving up after 3 attempts`); done = true; }
      else if (status === 429) { await sleep(30_000); }
      else { await sleep(10_000); } // cold start / transient
    }
    const rate = callErrors / calls;
    if (calls >= 5 && rate > ERROR_RATE_ABORT) {
      log(`ABORT: call error rate ${(rate * 100).toFixed(1)}% exceeds ${ERROR_RATE_ABORT * 100}% (${callErrors}/${calls})`);
      writeFileSync(join(EVID, 'probe-aborted.flag'), `error rate ${(rate * 100).toFixed(1)}%`);
      process.exit(3);
    }
  }
  await sleep(PAUSE_MS);
}

/* ---------- build the ledger ---------- */
const MAILBOXES = [...mailboxMeta.keys()];
const ledgerPath = join(EVID, 'dryrun-ledger.jsonl');
writeFileSync(ledgerPath, '');
let locatable = 0, wouldMint = 0, unlocatable = 0, deletedOnly = 0;

const rungBox = 'skipped:no_archive_roots (RETRO_BOX_ARCHIVE_ROOT_IDS absent live; BOX_API_ENABLED=true)';
for (const k of backlog) {
  const perVariant = {};
  const mailboxesHit = new Set();
  let whole = 0, deleted = 0;
  for (const v of k.variants) {
    const h = hits.get(v);
    if (!h) continue;
    perVariant[v] = h.perMailbox;
    for (const [mbx, c] of Object.entries(h.perMailbox)) {
      whole += c.whole; deleted += c.deleted;
      if (c.whole > 0) mailboxesHit.add(mbx);
    }
  }
  const isLocatable = whole > 0;
  const ackOnlyTrigger = [...k.categories].every((c) => c.startsWith('non_actionable/'));
  const row = {
    key: k.key,
    kind: [...k.kinds].join('+'),
    triggerRows: k.rowCount,
    triggerCategories: [...k.categories],
    mailboxesSearched: MAILBOXES,
    mailboxesHit: [...mailboxesHit],
    variantsSearched: k.variants,
    hitsByVariant: perVariant,
    wholeMailboxHits: whole,
    deletedScopeHits: deleted,
    perRung: {
      resolve_existing: 'none (enumerated as un-cased: no case_ matches key — would fall through)',
      box_archive: rungBox,
      outlook_search: isLocatable ? 'hit (whole-mailbox $search)' : 'no_hits',
      bottom: isLocatable ? 'not reached' : 'retroRecordFailure -> audit + Unable to locate stamp',
    },
    locatable: isLocatable,
    wouldMint: isLocatable, // R1 none by enumeration; Box skipped; Outlook rung persists (Held) subject to corroboration + the ack/digest mint guard
    mintGuardExposure: ackOnlyTrigger
      ? 'ack-only trigger: if the located original is the (ingested) ack itself, POST /api/internal/retro/create refuses (refused_category) and the key falls to Unable to locate'
      : null,
    sampleHits: (samples.get(k.variants.find((v) => samples.has(v)) ?? '') ?? []).slice(0, 3),
    probed: true,
    error: null,
  };
  if (isLocatable) { locatable++; wouldMint++; } else unlocatable++;
  if (isLocatable && deleted > 0) deletedOnly++; // deleted-scope hits observed (history lives there)
  appendFileSync(ledgerPath, JSON.stringify(row) + '\n');
}
for (const k of linkOnly) {
  appendFileSync(ledgerPath, JSON.stringify({
    key: k.key,
    kind: [...k.kinds].join('+'),
    triggerRows: k.rowCount,
    triggerCategories: [...k.categories],
    mailboxesSearched: [],
    mailboxesHit: [],
    variantsSearched: [],
    hitsByVariant: {},
    wholeMailboxHits: null,
    deletedScopeHits: null,
    perRung: {
      resolve_existing: `would LINK — an existing case_ row matches (exact=${k.r1Exact}); ladder ends at rung 1, no mint`,
      box_archive: 'not reached',
      outlook_search: 'not reached',
      bottom: 'not reached',
    },
    locatable: true,
    wouldMint: false,
    mintGuardExposure: null,
    sampleHits: [],
    probed: false,
    error: null,
  }) + '\n');
}

const summary = {
  probedAt: new Date().toISOString(),
  enumeratedKeyStrings: all.length,
  backlogProbed: backlog.length,
  wouldLinkAtR1: linkOnly.length,
  variantStrings: variantList.length,
  probeCalls: calls,
  callErrors,
  mailboxErrors,
  callErrorRate: `${((callErrors / Math.max(calls, 1)) * 100).toFixed(1)}%`,
  locatable,
  wouldMint,
  unlocatable,
  locatableWithDeletedScopeHits: deletedOnly,
  mailboxMeta: Object.fromEntries(mailboxMeta),
};
writeFileSync(join(EVID, 'probe-summary.json'), JSON.stringify(summary, null, 2));
log(`DONE ${JSON.stringify(summary)}`);
