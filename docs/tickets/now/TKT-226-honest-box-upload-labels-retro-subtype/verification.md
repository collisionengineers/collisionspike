# Verification — TKT-226: honest Box-upload labels + real `retro_related` subtype

## Status
LIVE-VERIFIED (labels) 2026-07-17. Offline acceptance fully green at commit `58d7ca09`; the live
lines below were executed after the same-day deploy of all four components. Remaining live lines
(fresh `after.origin` audit payloads, `retro_related` rows from a fresh reconstruction) ride the
2026-07-17 backlog sweep and are appended when that evidence lands.

## Deploys (2026-07-17, commit 58d7ca09, PR #102 branch)
1. DDL delta `2026-07-17-tkt226-retro-related-subtype.sql` applied FIRST (mandatory FK ordering —
   see changes.md): choice row `100000016 / retro_related / Related (retro-linked)` created;
   corrective backfill updated **0 rows** — expected, the FW26029 run's `retroLinkRelated` linked
   nothing (`linked:0, scanned:1`, banked trace), so no silently-nulled rows existed yet.
2. `cespk-api-dev` — `func azure functionapp publish` (self-contained artifact per
   docs/operations/deployment.md; sharp/durable markers verified pre-publish). All routes
   registered incl. `internalRetroBackfillFields`.
3. `cespkbox-fn-v76a47` — box-webhook publish, all functions registered.
4. `cespk-orch-dev` — orchestration publish; `retroRelatedIngestOrchestrator`,
   `retroBackfillFields`, `retroLinkRelated` registered (function list captured).
5. `cespk-spa-dev` — `swa deploy ./dist --env production` (carries the
   'Related (retro-linked)' label map).

## Acceptance line 1 — the FW26029 chip (the incident)
Chrome check 2026-07-17 ~02:15 UTC on the deployed SPA, Not Ready queue filtered to FW26029:
the row (VRM WF69NDX · FW26029 · Fairway Solicitors) shows **Last update: "File added to
archive — 16/07/2026"** — previously "Images Received". No manual reclassification, no audit-row
mutation: the same two `box_upload_received` audit rows are relabeled read-time from the
summary-filename fallback (`message-*.eml` / `email-body-*.txt` → non-image class). The case page
Readiness panel independently tells the honest story: "Images — need at least 2 accepted
(have 0)". Screenshot delivered in-session to the operator (not committed: raw binary ticket
evidence requires the content-addressed store + the governed image-review pipeline —
disproportionate for a queue screenshot; the live queue is the durable re-check).

## Acceptance line 4 (partial) — subtype plumbing
- Choice row present live (psql, 2026-07-17): `100000016 | retro_related | Related (retro-linked)`.
- FW26029's three linked rows read back (psql): original `100000000/100000000`
  (receiving_work / existing_provider_instruction), two triggers `100000001/100000003`
  (query / query_existing_work) — **no `images_received` row exists on the case**, closing the
  diagnostic loop: the queue chip was never an email classification.
- Fresh `retro_related` row proof: pending the sweep's first reconstruction that links related
  correspondence (this case's backfill linked nothing).

## Gate flip + re-drive sanity (TKT-225 adjacency)
`RETRO_RELATED_INGEST_ENABLED=true` set on `cespk-orch-dev` (2026-07-17T02:05Z). Force re-drive of
the FW26029 trigger (`retro-case` starter, `force:true`) completed `linked` — rung-1 dedupe/link
to the existing case, which by design returns before the related-ingest seam (the rung-1
related-backfill is the documented follow-up seam in TKT-225). Live ingest-chain proof is
expected from fresh creates during the sweep.

## Sweep-window live lines (2026-07-17 01:26–03:05Z, 286-row backlog sweep + 3-agent panel)
- Fresh `box_upload_received` audits carry the new `after` shape — CONFIRMED:
  `{"filename":"message-c1eb75bc.eml","evidenceClass":"email","origin":"external_upload"}` (03:05Z);
  107 sweep-window audits all well-formed.
- `inboundTaxonomyUnmapped` = **0** across the full window (Data API component KQL) — CONFIRMED.
- `retro_related` live — CONFIRMED: the SPA inbox type filter `?type=retro_related` returns
  **77 rows**, every one rendering 'Related (retro-linked)' with "Linked to case" status.
- Chip honesty at scale — CONFIRMED: Not Ready pages 1–2 (30 rows) contain ZERO dishonest chips;
  the single "Images received" chip (QDOS26104) is backed by 8 genuine damage photos; FW26029
  reads "Files received" with an honest 0-image Readiness panel.
- **DEFECT found by the panel (remediation ticketed)**: `origin='archive_mirror'` has never fired
  — boxArchiveEvidence stamps `box_file_id` before the webhook arrives, the sha256 twin then
  matches by identity, and `internal-persist-routes.ts:263-278` doesn't count it in `merged` →
  every mirror echo audits as `external_upload` (label-only; the dedup itself worked — zero
  duplicate rows). The 'Archived' rung of the label table is therefore live-unproven; also Box
  redeliveries re-audit (the `evidence_exists_for_box_file` shim always returns False). Fixed
  under the post-sweep remediation batch.
