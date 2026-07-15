# Verification — TKT-034: Inbound images: match to case / create Box folder by reg / flag

## Reopened lifecycle verification — 2026-07-13

**PENDING LIVE PROOF.** The earlier VERIFIED-LIVE ruling below covered classification, the visible flag and an empty gated registration-folder create. It does not verify the reopened 2026-07-12 lifecycle acceptance.

Offline implementation evidence now covers:

- persisted registration/message/file ledger and claim checkpoints;
- real image-byte upload, not empty-folder success;
- exact adoption by rename or merge, content deduplication and deterministic name collision handling;
- ambiguity/hold behavior, replay claims and partial-failure recovery;
- fresh Box scope checks and non-recursive empty-folder retirement;
- merge preservation/refusal when two different archive folders would be stranded.

Remaining verifier work after merge/deploy:

1. apply `2026-07-13-tkt034-archive-holding.sql` before the code deployment;
2. under Box test root `392761581105` only, ingest an unmatched image set with a defensible registration and prove the folder contains every accepted byte plus persisted ledger rows;
3. ingest later instructions for exactly one active case and prove the same identity is renamed or the files are moved/deduplicated into the Case/PO folder;
4. prove the old holding folder is absent only after the complete merge, evidence is linked once, the audit is present and no write occurred outside the test root;
5. repeat one delivery and one adoption trigger, then force a checkpoint failure/retry and confirm folder/file/evidence cardinalities remain one.

This section supersedes the earlier verdict for the reopened acceptance only. The historical verification remains below.

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier dispatch — final ruling after the W6 data pass; two
declared residuals, neither a defect: step-2 Box-by-reg **re-scoped-to-gate** behind the operator's
`BOX_REG_FOLDER_ENABLED` decision, and the literal sample .eml covered by 8 real same-shape live
specimens)

## Final ruling (transcribed verbatim, 2026-07-10, post-W6)

- **Line 1 — distinct Enquiries vs Case Queries: MET, LIVE at volume.** W6 Q4: **199
  `query_existing_work` + 4 `query_new_enquiry`** live rows; SPA labels in the served bundle; DDL +
  classifier split. (Subtype-granularity under `query` — the documented 2026-07-07 re-scope;
  distinct buckets in live use.)
- **Line 2 — 3-step fallback chain: LIVE for match + flag; step 2 present-but-gated.** Step 1: 093
  auto-attach VERIFIED-LIVE + Q3 (4 images-lane arrivals since 07-09, all routed+linked). Step 3:
  **8 live `images_no_match` stamps** (Q1: desk@, 07-09 09:47Z → 07-10 14:03Z, real image-delivery
  subjects); the route live-functional (these 8 + TKT-140's 6 sibling stamps); chip strings in the
  deployed bundle. Step 2: built + deployed, **dark** — `BOX_REG_FOLDER_ENABLED` absent live →
  `boxSkipped='reg_folder_gate_off'`; the chain routes through all three steps, step 2 evaluates and
  skips by gate.
- **Line 3 — unmatched image emails land on the flag step, not silently generic-queried: MET,
  LIVE.** The lane fired 8× on real unmatched arrivals in ~28h; Q2 shows nothing silently dropped —
  every flagged row is visibly flagged or linked (8/8 since linked; the sibling `unable_to_locate`
  rows exercise the chip live for the other reason).
- **Interpretation — case_id populated on all 8: designed behaviour, not a defect.** The stamp is
  write-once-at-decision and deliberately survives a later link; the link supersedes it
  presentation-side only (stated in `intakeOrchestrator.ts:240-242`, the DDL delta comment, and
  `inbox-status.ts:31-41` precedence). The 2 routed rows read as staff handling (the chip's exact
  purpose); the 6 new+linked rows read as the thread/suggest/backfill lanes finding a home the
  match-step missed. Both readings satisfy the acceptance's letter — the arrival was never silent.

### Residuals (expected, non-blocking)
1. **Step-2 gate (operator item):** `BOX_REG_FOLDER_ENABLED` flip + post-flip proof of one
   reg-keyed folder create (folder-naming-semantic approval). **Add to docs/gated.md** (changes.md
   suggested; not yet present). The rung was always conditional ("if a registration is viewable")
   and the acceptance sample itself skips it.
2. The literal sample .eml not re-intaken — superseded by the 8 live same-shape specimens.

### Advisory observations (improvement signals, not failures)
(a) flag-then-link-in-same-pass can leave the stamp as moot DB noise for rows the thread lane links
anyway — candidate refinement: skip/clear the stamp when the same instance links; (b) only 1 of the
8 flagged rows carries `images_received` subtype coding — the flag keys on the triage *action*
while `subtype_code` reflects Stage-A values, so subtype cuts undercount the flag lane.

### How to re-verify
Q1–Q4 as run; optional per-row attribution audit join for the 6 new+linked rows; az function list +
appsettings + bundle grep. Post-flip (operator): one unmatched image arrival with a viewable reg →
folder named by reg under `BOX_FOLDER_ROOT_ID` + Box 409-reuse on repeat.

Verified by: ticket-verifier dispatch, 2026-07-10.

---

## Initial sweep verdict (2026-07-10, pre-W6 — superseded by the final ruling above)
**PENDING** — deployed live and every rail live-proven piecewise; the single ticket-defining live
observation (a real unmatched image-bearing email stamped `images_no_match`) had not yet been read,
and the step-2 Box rung is deliberately dark behind an operator gate. Nothing FAILED.

## Sweep verdict (transcribed verbatim, 2026-07-10)

- **Line 1 — distinct Enquiries vs Case Queries: MET (deployed-live surfaces; subtype-level).**
  `query_existing_work` (100000003) + `query_new_enquiry` (100000004) in the domain choicesets, DDL
  lookup seed, and the classifier split (`provider_known ? existing_work : new_enquiry`). The
  deployed SPA bundle carries `Case query` / `New enquiry` labels + the `Queries/Enquiries`
  Outlook-folder plumbing. Note: delivered as two query SUBTYPES under category `query` per the
  2026-07-07 reconciliation note — distinct buckets exist, not a literal top-level category rename.
- **Line 2 — 3-step fallback chain: PARTIALLY LIVE (steps 1+3 live; step 2 built dark,
  operator-gated).**
  - Step 1 (match): banked VERIFIED-LIVE — TKT-093 auto-attach + TKT-043's `images_received` live
    rows; `TRIAGE_IMAGES_ROUTING_ENABLED=true` az-read this pass.
  - Step 3 (flag): `imagesUnmatched` in the LIVE function list (74 fns); the
    `POST /api/internal/inbound/attention` route is **live-functional** (TKT-140 stamped 6 real rows
    through this exact route/column with the sibling reason `unable_to_locate`); the
    `attention_reason` column + CHECK incl. `images_no_match` live-proven (07-09 psql postcheck);
    the SPA bundle carries the chip `No matching case` + a handler-plain MessageBar body.
  - Step 2 (reg-keyed Box folder): **built DARK** — `BOX_REG_FOLDER_ENABLED` absent on live orch
    (strict `=== 'true'` reader → off → `boxSkipped='reg_folder_gate_off'`). Matches LIVE_FACTS;
    the operator must approve the non-Case/PO folder-naming semantic before flipping.
- **Line 3 — the sample lands on the flag step: OFFLINE-PROVEN shape; live observation pending.**
  The rung test emits `{ action: 'route_images_unmatched', finalSubtype: 'images_received' }`
  (16/16); the activity stamps `images_no_match` ALWAYS (step 3 unconditional); the sample's
  no-viewable-reg shape would skip the Box rung (`no_registration`) even if lit. No synthetic
  injection made (mutation — outside the verifier remit); App Insights retention ~1h blocks
  execution history.

### Queued SQL (next data pass — Q1 decisive)
```sql
-- Q1 (decisive, line 3): any live images_no_match stamps?
SELECT ie.id, ie.source_mailbox, left(ie.subject,60) AS subject, ie.received_on,
       ie.attention_reason, ie.triage_state, ie.case_id
  FROM inbound_email ie
 WHERE ie.attention_reason = 'images_no_match'
 ORDER BY ie.received_on DESC;
-- Q2: review outcomes of attention-flagged rows (both reasons)
SELECT ie.attention_reason, ie.triage_state, count(*) AS rows, count(ie.case_id) AS since_linked
  FROM inbound_email ie WHERE ie.attention_reason IS NOT NULL
 GROUP BY 1,2 ORDER BY 1,2;
-- Q3: images-lane arrivals since the 07-09 deploy — linked vs flagged vs neither
SELECT ie.triage_state, (ie.case_id IS NOT NULL) AS linked,
       (ie.attention_reason = 'images_no_match') AS flagged, count(*)
  FROM inbound_email ie
  JOIN choice_inbound_subtype cs ON cs.code = COALESCE(ie.subtype_code, ie.suggested_subtype_code)
 WHERE cs.name = 'images_received' AND ie.received_on >= '2026-07-09T00:00:00Z'
 GROUP BY 1,2,3 ORDER BY 4 DESC;
-- Q4 (line 1 corroboration): the query-split subtypes in live rows
SELECT cs.name, count(*) FROM inbound_email ie
  JOIN choice_inbound_subtype cs ON cs.code = COALESCE(ie.subtype_code, ie.suggested_subtype_code)
 WHERE cs.name IN ('query_existing_work','query_new_enquiry') GROUP BY 1;
```

### Expected absences / notes (not bugs)
No live `images_no_match` row yet (the identical rail is live-proven for `unable_to_locate`); step 2
dark pending the operator gate decision — **distillation item: add `BOX_REG_FOLDER_ENABLED` to
docs/gated.md** (changes.md suggested it; not yet there); the evidence sample never re-intaken live
(worst-case shape pinned offline); the category split is subtype-granularity (documented re-scope);
no dedicated unit test for the `imagesUnmatched` activity (decision layer covered; activity is
best-effort glue by design).

### Close path
Q1 returning ≥1 row (or a supervised synthetic send) + the chip observed on that row in the SPA. The
Box rung stays a separate operator-gated item and should not block done if treated as
re-scoped-to-gate.

Verified by: ticket-verifier dispatch, 2026-07-10.

## Prior note (superseded)
NOT YET IMPLEMENTED — repro email(s) in evidence/ (RE Re127581.001_Mr E Taullaj.eml).
