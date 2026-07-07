# Changes — TKT-082: existing-case query misclassified as new client work

**Commit:** `1d7947e` (branch `fix/email-misclass-batch-081-083-093`).

## Root cause
sample-1 (Cauchie GM23 KPZ) is a QUESTION about **our** existing report ("out of the 18 hours
quoted in your report, how many are for paint?") with the report PDF re-attached. The
substring keyword `engineers report` matched "your attached Engineers **Report**", so
`work_phrases` was non-empty → the reply-suppression clause `(is_reply && !work_phrases)` did
NOT fire → Rule 1 promoted it to `new_client_work`. sample-2's two threads already classify
`query_existing_work` / `case_update` in the in-tree engine (the live parser was just older).

## Fix
- **Classifier**: a possessive **"your report"** about-existing signal
  (`_OUR_REPORT_REFERENCE_RE`) is added to `suppress_as_query`, neutralising the false
  `engineers report` work keyword → the question suppresses out of the receiving-work rules to
  `query_existing_work` (about work we already did). A genuine "please provide AN engineer's
  report" (no possessive) is unaffected.
- Both sample-2 threads pinned as regression pins.

## Deploy
- **Parser DEPLOYED 2026-07-07** — the classifier fix is live.

## Dedup note (ticket ask)
Because the samples now classify `query`/`case_update` (not `receiving_work`), they never
reach the mint/dedup path at all — the fix is UPSTREAM of dedup, so no duplicate case is
possible. The existing dedup/twin guard (ADR-0010: VRM-only never auto-creates a twin;
same-VRM → Held) is unchanged.
