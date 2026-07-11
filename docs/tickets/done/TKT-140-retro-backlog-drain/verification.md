# Verification — TKT-140: Bulk retro backlog drain — reconstitute historical un-cased emails from Deleted Items

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed below), followed by the
orchestrator W2c confirmatory data pass — every queued value exact.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

### Verdict
VERIFIED-LIVE

(Every acceptance line carries live, independently gathered proof — the verifier's own KQL against
the live orch component reproduces the drain's counters and both mint-guard refusal timestamps to the
second, and the implementer's Postgres transcripts are timestamp-corroborated by those traces. The
confirmatory data-pass SQL was queued and has since been run — results below; nothing diverged.)

### Evidence

**Line 1 — dry-run report with per-rung outcomes, no writes:**
- Ledger recomputed by the verifier's own script (not the summary's numbers):
  dryrun-ledger.jsonl = 107 rows (88 probed + 19 link-only), all 107 carrying all four perRung
  fields; locatable 75, unlocatable 13, highNoise 13 (definition holds: all ≥20 hits), wouldMint 75,
  0 error rows. Matches probe-summary.json + probe-run-log.txt (15 paged calls, 0 errors).
- No-writes proof: drive-probe.mjs POSTs only `/api/retro-deleted-probe`; the deployed route issues
  only folder-property GETs + $search reads (no write verb exists in the file); enumeration.sql is
  SELECT-only; the retro-case starter was NOT called in the dry-run (first `retro-case-start`
  request in App Insights is 15:28Z).
- Gates at run time cross-checked against the registry (RETRO_CASE_ENABLED=true both apps,
  RETRO_OUTLOOK_SEARCH_ENABLED=true, RETRO_BOX_ARCHIVE_ROOT_IDS absent → Held-only mints).

**Line 2 — operator-approved drain window creates Held cases, audited; unlocatable stamped:**
- Outcome splits recomputed from drain-ledger.jsonl (99 rows, all terminal Completed, 0 hard errors,
  window 15:28:03–15:50:05Z, batches 10×≤10): created 34 (all with caseId, 0 with casePo), linked
  30+7=37, no_source 6, not_eligible 3, trigger_not_found 19, distinct cases 47. Pilot + resume
  tallies reconcile exactly.
- Verifier's independent KQL (15:20–16:00Z): `retro-case-start` = 99 requests 0 failed;
  `retroCaseOrchestrator` 831 invocations 0 failed; `retroFindTrigger` 99/0; `retroRecordFailure`
  exactly 6/0. **Both mint-guard refusals observed live in the trace pull** —
  `{"evt":"retroCreatePersist","outcome":"refused_category"}` at 15:33:36Z and 15:40:34Z, matching
  the Postgres audit transcript to the second.
- Approval trail: operator pre-authorization 2026-07-10 conditional on the dry-run GO criteria;
  all three criteria independently re-verified on the verifier's recount (0.0% errors, 75 ≤ 500,
  mint guards evidenced incl. a pre-drain 2026-07-09 refusal audit + the two in-drain refusals).
- Held invariant + stamps corroborated by the timestamped transcript
  (drain-after-context.txt): retro-channel 88/88 on_hold, 0/88 case_po; enumerated-118 → 71 linked;
  unable_to_locate 3→7; un-cased backlog 281→218.

**Line 3 — no mailbox mutations at any point:**
- Code path: the drain called only the keyed retro-case starter; the ladder touches Graph only via
  $filter/$search/message GETs. In the whole orch codebase the only Graph mailbox-write helpers
  (ensureMailFolderPath, moveMessage) are referenced solely by outlook-move.ts — not reachable from
  the retro path. KQL: outlook-move executed 0 times in the window; the single HTTP dependency row is
  an MSI token GET. (Raw fetch() Graph calls emit no dependency telemetry — line 3 rests on the
  code-path audit + zero write-lane executions.)

### Pending / gaps (from the verifier, none blocking)
- Postgres row state was queued, not read by the verifier (firewall-write constraint) — now closed by
  the W2c pass below.
- dryrun-ledger.jsonl carries highNoise/recommendedForDrain fields the committed driver does not emit
  (an uncommitted augmentation step ran); values internally consistent (62+19=81 recommended → the
  99 drainable rows) but exact regeneration from the committed driver alone is not possible.
- Graph verb telemetry absent for raw fetch() — absence-of-write proven by code path, not telemetry.
- SPA spot-check of the minted cases/"Unable to locate" chips not performed (needs a staff session) —
  data-level equivalents covered by Q1–Q3.
- Honest residuals (recorded, not acceptance failures): 19 trigger_not_found rows stay un-cased and
  UNSTAMPED (the ladder returns before the failure-record rung — follow-up candidates already filed
  in changes.md: stamp this path; cross-mailbox trigger lookup); 3 not_eligible refusals; 19 withheld
  rows per the dry-run recommendation; parser VRM artifacts on Held mints (JUL2026, EY12SSU vs
  YE12SSU) — staff-review material on Held cases by design.

## Orchestrator confirmatory data-pass W2c (run 2026-07-10, transient window trap-deleted; SQL preserved at [evidence/verifier-confirmatory-w2c.sql](./evidence/verifier-confirmatory-w2c.sql))

- **Q1 (34 minted cases):** found 34 / retro_channel 34 / held 34 / po_null 34. ✓
- **Q2 (71 drained inbound→case pairs):** pairs 71 / matching 71. ✓
- **Q3 (6 no_source rows):** found 6 / still_uncased 6 / stamped unable_to_locate 6. ✓
- **Q4 (19 trigger_not_found rows):** found 19 / still_uncased 19 / unstamped 19 (the honest
  residual, exactly as recorded). ✓
- **Q5 (drain-window audits):** retro_case_created 42 (34 drain + 8 concurrent live-intake retro
  mints in the same window — the verifier pre-flagged this exact delta; the KQL showed the extra
  sub-orchestrations), retro_case_linked 38 (≥37 ✓), retro_reconstruction_failed 6 ✓.
- **Q6 (standing Held invariant across ALL retro-channel cases):** 0 violating rows. ✓

## How to re-verify
Ledger recounts over the two JSONL files; the KQL bundle in the verifier block (99/0 starter
requests, refusal timestamps); re-run evidence/verifier-confirmatory-w2c.sql in a read-only window;
`grep -n "method: 'POST'" orchestration/src/lib/graph.ts` → token mint + the two move-lane helpers
only.
