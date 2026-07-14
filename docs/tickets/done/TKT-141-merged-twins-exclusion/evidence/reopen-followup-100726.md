# Reopen follow-up — TKT-141 (dated 2026-07-10, verify-sweep FAILED verdict)

## What failed live
The PK20FWT twin badge reads **3** on the deployed dashboard (pinned expectation: 1), and the two
2026-07-09 TKT-092 merge retirements (PCH26020 `19b96214…`, YH13ZSN-retired `d1d862bd…`; also
PCH26018 `cd9092ce…`) render as **Needs review** — they have been **un-retired** in the live DB since
the fix shipped. The YH13ZSN pair regressed too ("2 · same VRM"). Screenshots (in the verifier
session): ss_3810g7u3s (dashboard), ss_6937jo8cv / ss_1674smrll (case pages).

## Attribution (honest)
The TKT-141 exclusion code is CORRECT, offline-proven (46/46 api + 11/11 domain tests), present in
the deployed bundle, and single-sourced per the TKT-012 contract (acceptance line 3 VERIFIED by
code-read). The failure is a **durability gap upstream**: `linked_to_instruction` is a non-terminal
branch state and the status guard recomputes status from fields/images with no knowledge of
`duplicate_keys.mergedInto` (`packages/domain/src/contracts/case-status.ts:74-76` note +
`statusForReviewCase` L211-234 returns `needs_review` for these cases). Any touch — re-ingest,
evidence event, PATCH, status re-evaluation — silently un-retires a merged case, and the
status-gated `isRetiredMerged` predicate goes inert. Heavy intake churn was live during the
verification window (Held 112→121 within minutes) — the plausible trigger; exact events = W2 SQL Q2.

## Fix direction (for the re-implementation dispatch)
1. **Retired-lock in the status guard:** when `duplicate_keys.mergedInto` is present, the status
   recompute must preserve the retired state (or an equivalent durable mechanism) instead of
   recomputing to needs_review. Domain-level change (`statusForReviewCase` / its caller seam) +
   regression test: touch a retired-merged case → status stays retired.
2. **Re-apply the data fix:** re-retire the three un-retired rows (them + any Q3-discovered hybrids
   — rows carrying the mergedInto marker with status ≠ 100000006), audited, after the lock deploys.
3. Re-verify: PK20FWT badge = 1; retired rows absent from needs-action/stage counts; still openable
   directly; then TKT-092's postcheck state is restored too (its verify record is impacted by the
   same regression).

## W2 data-pass SQL (queued by the verifier — run before the fix dispatch)
- Q1: current state of the five merge-party rows (ids in verification.md).
- Q2: the append-only audit trail since 2026-07-09 for the three retired rows — what re-opened them.
- Q3: all rows carrying `duplicate_keys LIKE '%mergedInto%'` with status ≠ 100000006 (the un-retired
  hybrid population the re-fix must cover).
