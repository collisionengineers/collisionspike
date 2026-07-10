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

## Orchestrator data-pass W2 — pending

The queued watch-item SQL (Q-A, Q-B1, Q-B2, Q-C, Q-C2, Q-D) runs in the W2 batched window; results
appended here. Reopen trigger: Q-A or Q-B1 non-zero (modulo the documented boundary-window artifact).
