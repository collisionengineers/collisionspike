# Verification — TKT-133: Evidence dedup + box-webhook kind

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below). The verifier
ruled on the acceptance's letter: line 1 names the regression test as its proof artifact (it exists
and passes); lines 2–3 carry live evidence. Queued watch-item SQL rides the orchestrator W2 data
pass — if Q-A/Q-B1 return non-zero, reopen.

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

(Ruling on the dispatcher's question: the Acceptance's own letter for line 1 reads "A photo arriving
via email AND its Box mirror yields ONE evidence row **(regression test)**" — the parenthetical names
the required proof artifact, and it exists and passes. The letter does not demand an observed natural
absorb event. Lines 2–3 have genuine live evidence. The direct email→Box absorb remains
unobserved-in-nature and is listed as a watch-item with queued SQL, not a blocker.)

### Evidence

**Line 1 — email + Box mirror → ONE row (regression test):**
- Regression test run by the verifier this pass: `cd api; npx vitest run
  src/functions/internal-evidence-dedup.test.ts` → **8/8 passed** (7 original incl.
  email-then-Box-mirror = ONE row + mirror-first direction + cross-case negative; 8th = the PR52-F1
  sameIdentity-redelivery pin).
- Deployed api bundle carries the seam: `deploy/api/main.cjs` — `SHA256_HEX_RE` (:18200), twin
  pre-check (:18230), `merged++` (:18268), response `{ persisted, updated, merged }` (:18371).
  Deployed orch bundle carries the email-lane sha256: `deploy/orch/main.cjs` —
  `buildBaseEvidenceRows` (:50001, sha256 spread :50006/:50013), used by `classifyPersist` (:50021).
  Registry records the 2026-07-09 D2 publish naming TKT-133 on api + orch; counts api 96 / orch 74.
- Live traffic through the dedup path (KQL, api component): `internalCasesEvidence` 571 requests
  2026-07-09 + 1,121 on 2026-07-10, all resultCode 200.
- Live negative-space: TKT-144's independent 2026-07-10 data pass found **0 active same-case
  same-sha buckets formed on 2026-07-10** despite live intake; reverse evidence — TKT-146's
  live-proof upload deliberately mutated bytes so the TKT-133 sha dedup could not absorb it.

**Line 2 — existing twins enumerated + merged with audit; EVA order shows each photo once:**
- Executed live 2026-07-09 (transient-FW csadmin): 68 blob↔box pairs found → 58 box twins excluded +
  1,411 box↔box same-name dups across 111 cases, per-case `duplicate_dropped` audits, statuses
  re-evaluated (2 moves, none regressed), marker case A.QDOS26035 EVA order = each accepted photo
  once. Backups verified present and consistent this pass (backup-twins-before.csv 137 lines;
  backup-boxbox-before.csv 2,802 lines).
- The honest remainder (214 blob↔blob same-name rows) was independently collapsed by TKT-144
  (2026-07-10): all 106 groups byte-identical, 108 twins soft-merged, 0 active same-name same-hash
  pairs remaining — corroborating from a separate pass with full run artifacts.

**Line 3 — box-webhook sends the true kind; guard stays:**
- Source at seams: `functions/box-webhook/evidence_kind.py` + `function_app.py:685` (no hard-coded
  'image') + `_fetch_box_sha256` (:597, invoked :678). Registry records the 2026-07-09 box-webhook
  publish ("TKT-133 true-kind + sha256 at source", boxWebhook 12 fns).
- Live execution with the new call signature (KQL): three `Functions.box_webhook` executions
  Succeeded 2026-07-10T15:16Z, each span showing `GET /2.0/files/<id>?fields=id,name,size,sha1` +
  `GET /2.0/files/<id>/content` (the `_fetch_box_sha256` download) before the evidence write.
- Guard intact: TKT-124 kind guard still in `api/src/functions/internal.ts:2456-2469` — preserved in
  the same deployed api build.

### Pending / gaps
- **Expected absences (not bugs):** a naturally-occurring cross-lane absorb (`merged` ≥ 1 on a real
  email+Box mirror) has not been directly observed — App Insights cannot see it (the merge branch
  emits no trace; response bodies unlogged) and TKT-144 recorded no write-time link by
  2026-07-10T14:08Z. Not required by the acceptance's letter; queued Q-B2 will surface one when it
  happens. Line 3's live behavioral sample for a NON-image Box upload is data-dependent (expected
  absence if none arrived). Files over the 25 MiB facade cap get sha256=NULL and won't dedup-link —
  accepted, recorded.
- **Real caveats:** write-time merges are unaudited on the api route (recorded candidate follow-up).
  DB counter-confirmation queued for the orchestrator pass; if Q-A/Q-B1 return non-zero, reopen
  (Q-A may legitimately show boundary-window pairs formed 2026-07-09→10T14:08Z before the TKT-144
  backfill armed the key — check created_at).

### How to re-verify
- Regression test: `cd api && npx vitest run src/functions/internal-evidence-dedup.test.ts` (8 pass).
- Bundle markers: grep `deploy/api/main.cjs` for `persisted, updated, merged`; `deploy/orch/main.cjs`
  for `buildBaseEvidenceRows`.
- KQL per docs/azure/logs-kql.md: api `requests | where name contains "internalCasesEvidence"`;
  parser component traces for the box_webhook `fields=id,name,size,sha1` + `/content` span pair.
- Queued SQL Q-A/Q-B1/Q-B2/Q-C/Q-C2/Q-D (cross-lane twins now; write-time holding; absorb candidates;
  FILE.UPLOADED kinds+sha coverage; non-image-as-image honesty check; marker-case EVA order) — full
  text preserved in the W2 data-pass section below once run.

### Confidence + unread surfaces
High on lines 1–2, high-with-caveat on line 3. Unread: live Postgres this pass (firewall-gated,
queued); the deployed box-webhook Python bytes (registry + live KQL call-signature match relied on);
the SPA EVA-order screen (covered by ticket artifacts + Q-D). KQL retention on the free SKU is short
(~24–48h) — 2026-07-09 deploy-day traces may already be partial.

## Orchestrator data-pass W2 (run 2026-07-10, transient window trap-deleted)

- **Q-A (cross-lane mirror twins now): 2** — both the DOCUMENTED boundary-window artifact, not
  reforming twins: created 2026-07-02 and 2026-07-08 (cases 3ae1a4be…, df9a2069…), i.e. BEFORE the
  2026-07-09 dedup deploy; they only became visible as twins when TKT-144's backfill armed their
  blob rows' sha256 today. Mini-cleanup follow-up candidate; not a reopen trigger.
- **Q-B1 (byte-less box rows since 07-10 duplicating an active same-case sha): 0** — the write-time
  dedup is holding under live intake + Box archiving. ✓
- **Q-B2 (absorb candidates since 07-09): 744** (informational).
- **Q-C (box_upload kinds + sha since 07-09):** image 266 (252 sha) / email 57 (46) / instruction
  51 (43) / other 18 (15) / engineer_report 2 (2) — honest kinds flowing, sha coverage high. ✓
- **Q-C2 (non-image stored as image since 07-10): 0.** ✓
- **Q-D (marker case A.QDOS26035 EVA dupes): 0 rows.** ✓

Verdict stands: VERIFIED-LIVE.

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the stale `VERIFIED-LIVE` verdict for the PR 55 merge-path regression. The old
live twin census remains historical evidence and does not prove the repaired merge code.

- The merge transaction locks both evidence sets, canonicalises usable SHA-256 values, chooses one
  deterministic survivor, fills only missing Blob/Archive/review provenance and moves only
  non-colliding rows. Redundant source twins remain on the retired case rather than becoming active
  survivor duplicates; null/invalid hashes retain the normal move path.
- Pending Archive work moves with the surviving row. A collision completes redundant source work and
  requests a copy for an eligible survivor, preventing dedup from discarding the only mirror request.
- `api/src/functions/cases-merge.test.ts` covers target collisions, complementary provenance,
  deterministic source-twin collapse, ordinary different-hash moves and Archive-request transfer.
- Deployment proof still required: deploy the API, merge a prepared same-SHA pair and confirm one
  active survivor photo in evidence/EVA ordering, preserved provenance and no duplicate readiness
  count. No new live merge is claimed here.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- The original three acceptance lines have substantial live evidence. The prior live record reports 571
  calls through `internalCasesEvidence`, the audited cleanup of 106 byte-identical groups/108 twins, zero
  active same-name/same-hash duplicates after cleanup, one-photo EVA ordering for the marker case, true
  Archive kinds at source, and the API guard retained
  (`docs/tickets/verify/TKT-133-evidence-dedup-box-kind/verification.md:4-80`). The later forward-window
  queries report zero active same-SHA duplicates since 2026-07-10 and honest Archive-lane kinds: image 266
  (252 with SHA), email 57 (46), instruction 51 (43), other 18 (15), engineer_report 2 (2)
  (`verification.md:83-103`).
- Both supplied pre-cleanup datasets were read and structurally checked in full.
  `evidence/backup-twins-before.csv` has SHA-256
  `9518019A026375EDCE457666B2AC02D31AC611186DF0A39F3C15D47A8EF4244E`, 136 data rows forming 68 exact
  blob/Archive pairs across 18 cases. `evidence/backup-boxbox-before.csv` has SHA-256
  `281DCBB282F8BD3B88D6E900A606D1914571DF50CBCFB13D4714F0D5FFF4CA89`, 2,801 unique rows across 111
  cases, comprising 1,369 two-row and 21 three-row valid same-case/file/Archive-id duplicate groups; no
  malformed or cross-case grouping was found. These support enumeration, not post-repair merge behavior.
- The later regression correctly supersedes the old overall `VERIFIED-LIVE` verdict: the case-merge route
  could bulk-reparent two evidence sets that already contained the same SHA, recreating an active
  duplicate (`changes-regression-11-07-26.md:5-16`; `verification.md:105-122`).
- The repair is implemented and offline-covered: it locks both evidence sets, canonicalizes usable
  SHA-256 values, coalesces complementary provenance, keeps one active survivor, preserves null/invalid
  hash move behavior, and transfers/retires Archive work safely. Focused coverage is recorded in
  `api/src/functions/cases-merge.test.ts` (`verification.md:112-120`). Commits `057f7a0` and `070a0bf` are
  ancestors of PR 55's deployed merge `c7e78cc`, the corrected runtime `3cc4705`, and the later deployed
  tree `54a04d`; `.azure/deployment-plan.md:334-341` proves the API was published.

## Pending / gaps

- There is no post-repair live witness of a legitimate case merge where source and target already hold
  the same SHA. The historical twin census and normal intake/Archive dedup telemetry do not exercise this
  superseding merge-path regression.
- There is consequently no post-merge live readback proving exactly one active survivor photo,
  complementary provenance retained, the redundant source row still retired, null/invalid hashes still
  moved normally, pending Archive work neither lost nor duplicated, and EVA/ZIP/readiness counts each
  photo once.
- Deployment lineage is proven, but deployment alone cannot restore `VERIFIED-LIVE`. The ticket's own
  superseding block explicitly requires the live same-SHA merge and post-state count
  (`verification.md:105-122`).
- This verification deliberately created no duplicate, performed no merge, changed no database/firewall
  state, and made no Archive write.

## How to re-verify

1. Wait for or identify an existing legitimate pair of merge-eligible live cases whose evidence sets
   already share one canonical SHA-256; do not fabricate cases or evidence. Capture read-only pre-state
   for both evidence sets, provenance fields, Archive work/outbox rows, case status/readiness, and EVA
   ordering.
2. Have an authorized staff operator perform the normal live case merge. Capture the signed-in
   request/response and telemetry for the deployed `mergeCases` route.
3. Read back the transaction state: exactly one active target evidence row for the shared SHA; the
   redundant source row remains retired; complementary source/provenance values are retained; source-only
   non-colliding and null/invalid-hash rows moved normally; no active evidence remains on the retired case.
4. Confirm pending Archive copy/recovery work exists once for the eligible survivor and no redundant
   source work can recreate the twin. Read the generated EVA/ZIP and readiness/chase counts to prove the
   photo appears once.
5. Re-run the forward-window same-case/SHA census and non-image-as-image kind query; both must remain zero.

## Confidence + unread surfaces

High confidence in the original email/Archive dedup contract, historical cleanup evidence, true-kind
source/guard, regression implementation, offline coverage, and deployed ancestry. Insufficient confidence
to certify the superseding merge-path behavior live. Unread/unexercised surfaces: a post-release live
same-SHA merge transaction, current direct Postgres post-state, signed-in merge response, generated
EVA/ZIP bytes, and current Archive/outbox readbacks.
