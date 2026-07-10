# Verification — TKT-082: existing-case query misclassified as new client work

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier dispatch — supersedes the interim verdict below)

## Final sweep verdict (transcribed verbatim, 2026-07-10)

- **Acceptance 1 — both sample threads classify query/update in the eval corpus (PROVEN, fresh run
  this session):** all three pins in `scripts/eval-email/manifest.json`
  (`tkt082-query-your-report` → query/query_existing_work; `tkt082-query-reply-eref1` →
  query/query_existing_work; `tkt082-caseupdate-reply-images` → case_update/images_received). Fresh
  `run_eval.py` against the current tree (same lineage as live engine-v2.15): all three pass;
  committed `baseline-v2.json` records `category_correct: true` ×3; the enforced unit test passes
  fresh.
- **Acceptance 2 — an email matching an open case by VRM/ref does not create a second case (PROVEN
  LIVE AT VOLUME):** KQL over the full classifier-era retention (2026-07-02 → 07-10): **472/472
  classifier-era mints pair with a `receiving_work` classifyInbound trace (−10m/+1m); zero mints
  pair with only non-work classifications** (the 8 unpaired are all 2026-06-27, pre-classifier).
  **620 non-work classified arrivals (query 305, other 197, case_update 55, non_actionable 52,
  cancellation 9, billing 1, pre_instruction 1) → 0 mints.** Zero guard-refusal traces — nothing
  non-minting even reached the API belt-and-braces (`intakeOrchestrator.ts:265` catches first).
  **Live recurrence of the ticket's own shape:** 2026-07-10 15:57:16Z query/query_existing_work →
  `attach_case` onto ALS26007 (`rung:ref_gate, matchTier:job_ref, matchCount:1`); 15:38:54Z query →
  `suggest_attach` onto QDOS26079 (vrm); case_update analogues onto AX26008 + A.QDOS26059/QDOS26078.
  51 query-lane + 62 case_update-lane attach/suggest decisions in-window, all non-minting.
- **Acceptance 3 — genuine new instructions still promote (PROVEN LIVE):** receiving_work decision
  2026-07-10 16:47:01Z → `caseResolve created` 16:47:03Z (case `d142e09e`); 34 new_client_work
  decisions in-window; 388 existing_provider_instruction arrivals minting daily. Offline: full
  classifier suite **176 passed / 0 failed**; no receiving_work metric regression.

### Side-finding (not a TKT-082 failure — routed to the Tractable family / baseline adjudication)
The full-corpus `--check` exits 1 vs both committed baselines with exactly **one new drift**:
`tkt103-tractable-lead` (recorded other/other, now case_update/images_received) — a post-082 engine
change (TKT-102/103 era, engine v2.13–v2.15), non-minting→non-minting, no TKT-082 pin involved. The
other 7 mismatches are pre-existing recorded baseline misses.

### Queued SQL (corroborative; next data pass)
```sql
-- S1: guard-breach check — any case minted from a non-work-classified email (expect 0 rows)
SELECT c.id, c.case_po, c.created_at, sc.name AS suggested_category
FROM case_ c
JOIN inbound_email ie ON ie.source_message_id = c.source_message_id
JOIN choice_inbound_category sc ON sc.code = ie.suggested_category_code
WHERE sc.name <> 'receiving_work';
-- S2: the sample threads if they transited live mailboxes (absence expected — operator drop-note origin)
SELECT ie.received_on, left(ie.subject,60), sc.name, ss.name, ie.triage_state, ie.case_id
FROM inbound_email ie
LEFT JOIN choice_inbound_category sc ON sc.code = ie.suggested_category_code
LEFT JOIN choice_inbound_subtype ss ON ss.code = ie.suggested_subtype_code
WHERE upper(replace(coalesce(ie.body_vrm,''),' ','')) IN ('GM23KPZ','NA68FMU')
   OR ie.subject ILIKE '%GM23 KPZ%' OR ie.subject ILIKE '%NA68 FMU%'
ORDER BY ie.received_on;
-- S3: twin guard on the sample VRMs (expect <=1 case per VRM)
SELECT upper(replace(vrm,' ','')) AS vrm, count(*) AS cases
FROM case_ WHERE upper(replace(coalesce(vrm,''),' ','')) IN ('GM23KPZ','NA68FMU') GROUP BY 1;
```

### How to re-verify
Offline: `run_eval.py --taxonomy v2 --check baseline-v2.json` + the parser classifier pytest. KQL:
the mint stitch (caseResolve created ↔ classifyInbound category, −10m/+1m). Query-lane spot check via
`triage_decision` customEvents (note: customEvents are sampled — volume claims rest on the complete
trace stream). DB: S1–S3.

Verified by: ticket-verifier dispatch, 2026-07-10.

### S1 adjudication (post-W6, same verifier — the 40-row result explained; VERIFIED-LIVE stands)
W6's S1 returned 40 rows against an "expect 0". Adjudicated **hypothesis (b), confirmed with code +
telemetry**: the rows are the **ADR-0022 retro reconstruction lane** (`RETRO_CASE_ENABLED`, live
since ~07-07) — `retroCreate` (`api/src/functions/internal-retro.ts:385-419`) deliberately inserts
`case_.source_message_id = original.internetMessageId`, and "a stranded update email IS the
reconstruction target when no instruction survives, and it lands Held needs_review (never terminal,
never a PO)" (`internal-retro.ts:323-329`). Empty `case_po` on all 40 is the confirming NEVER-MINT
fingerprint; telemetry brackets the span exactly (90 `retroCreate outcome:created`, 07-07 12:06:56Z
→ 07-10 16:11:50Z). Hypothesis (a) refuted at the write site (`internal.ts:1505` —
`COALESCE(suggested_category_code, $2)`, strict fill-if-null, never overwritten); hypothesis (c)
refuted — the 472/472 stitch measured the `caseResolve` primary mint lane; retro creates never pass
through it, and retro's rung 1 (`retroResolveExisting`) links to ANY existing case before
reconstruction (S3's GM23KPZ=1 / NA68FMU=1 consistent). Edge recorded: the single 'other'-suggested
hit predates the TKT-119 `mintBlockedByCategory` belt (`internal-retro.ts:330-345`), which now
refuses other/non_actionable/pre_instruction originals (live `refused_category` events 07-09→07-10)
— closed going forward.

**Record wording:** S1's 40 rows = retro-lane (ADR-0022) reconstruction-source associations — Held,
PO-less, get-or-create + link-first, gated — not mint-guard breaches. Corrected breach query for
future passes (expect 0 rows; and the identity check should show all four counts equal):
```sql
SELECT c.id, c.case_po, c.created_at, sc.name AS suggested_category
FROM case_ c
JOIN inbound_email ie ON ie.source_message_id = c.source_message_id
JOIN choice_inbound_category sc ON sc.code = ie.suggested_category_code
WHERE sc.name <> 'receiving_work'
  AND coalesce(c.intake_channel_kind_code, -1) <> 100000003;  -- 100000003 = 'retro'
SELECT count(*) AS joined_nonwork,
       count(*) FILTER (WHERE c.intake_channel_kind_code = 100000003) AS channel_retro,
       count(*) FILTER (WHERE c.on_hold) AS held,
       count(*) FILTER (WHERE c.case_po IS NULL OR c.case_po = '') AS no_po
FROM case_ c
JOIN inbound_email ie ON ie.source_message_id = c.source_message_id
JOIN choice_inbound_category sc ON sc.code = ie.suggested_category_code
WHERE sc.name <> 'receiving_work';
```
If `channel_retro < joined_nonwork` when run, the remainder needs a fresh look; on the code +
telemetry above, equality is expected.

## Interim verdict (2026-07-07, superseded)
CLASSIFIER FIX LIVE + PROVEN (2026-07-07). Live-occurrence probe on a real matching thread +
the SPA suggest-link click-through remain (bearer-gated for the agent).

## 1. Offline eval (both threads pass)
Real classifier run on the samples:
- sample-1 (Cauchie, "your Engineers Report" + a question, PDF attached) →
  `query/query_existing_work` (was `receiving_work/new_client_work`).
- sample-2 eml1 (Tasker reply) → `query/query_existing_work`; eml2 (image-delivery reply) →
  `case_update/images_received`. Neither is `new_client_work`.

Pinned in `scripts/eval-email/manifest.json` (baseline-v2 regenerated, `--check` clean) + an
enforced unit test (`test_tkt082_question_about_your_report_is_query_not_new_work`). Full prior
corpus green.

## 2. Gate + deploy
Parser deployed live 2026-07-07 (`cespike-parser-dev-x7xt3d5ovhi7y`).

## 3. Live probe (PROVEN)
`POST /api/classify-email` on the live parser, sample-1 shape ("your attached Engineers Report
… how many are for paint?", instruction-kind PDF, reply header) → **`query/query_existing_work`**.

## 4. Recall guard
A genuine new instruction still creates a case: `test_instruction_doc_with_caseref_promotes`,
the Tier-1 corpus cases, and the "please provide AN engineer's report" phrasing (no possessive
"your") all still promote to `receiving_work` (full corpus green).

## Pending
- A live-occurrence probe on a real matching thread (Postgres: tagged query/update, linked or
  suggest-linked to the existing case, no new case row) + the SPA click-through.

## How to re-verify
Classifier pytest + the live `POST /api/classify-email` probe above.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING (update). Both sample threads live-classify to non-minting lanes (query/query_existing_work rule:reply_with_reference; the images-bearing reply to case_update/images_received); eval pins green; recall probe still promotes genuine instructions. Outstanding: the class-3 live-occurrence Postgres proof (a real matching thread -> linked, no new case row) — cannot be manufactured read-only.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
