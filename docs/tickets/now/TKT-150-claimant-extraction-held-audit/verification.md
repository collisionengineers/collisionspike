# Verification — TKT-150: Restore claimant-name extraction and remediate affected held cases

## Verdict

PENDING

The runtime changes are deployed and the checked-in runner contract is tested, but the latest fresh
deployed-fingerprint plan failed its independent audit. The ticket cannot be marked verified or done until the
remaining source-binding defect is fixed, a brand-new plan passes audit, and a current plan-bound
backup/restore, named approval, fill-only live apply, complete residual ledger, and independent
fresh-case/family proof exist.

## Acceptance evidence — 2026-07-14

1. **Census — PENDING LIVE.** V8 produced a 156-case repeatable-read baseline: 27 proposed repairs, 93
   absent-in-source, 0 conflicts, and 36 failures. The independent audit failed, so the plan is superseded and
   is not apply authority.
2. **QDOS26079 trace — FAILED CURRENT PLAN.** V8 found a claimant in the retained PDF, but exact retained-source
   identity still failed at `source_processing`. The row authorised no write. It must pass in a newly generated
   and independently audited plan.
3. **Failure-family fixtures — TESTED OFFLINE / INCOMPLETE FOR LIVE SHAPES.** Sibling-first immutable parser
   fixtures cover the known parser families through `engine-v2.24`, but v8 exposed 18 tokenized
   retained-text bindings and root-level raw-email pairs that the live source-identity model did not resolve.
4. **Safe extraction — TESTED OFFLINE.** Provider labels and ordinary instruction wording are covered alongside
   negative controls for handlers, signatures, repairers, third parties, insured/policyholder names,
   organisations, placeholders, and unrelated prose.
5. **Precedence and visible conflicts — TESTED OFFLINE.** Document values outrank body inference; differing
   candidates are retained with stable sources, mapped into the API contract, and shown in plain language while
   preserving the saved value.
6. **Create/merge/replay/later-document consistency — TESTED OFFLINE / PENDING LIVE.** All four paths use the
   shared source-aware claimant seam. Claimant provenance failure is transactional, merge never fabricates a
   staff source, and terminal transport replay performs no mutation.
7. **Held provider recovery — TESTED OFFLINE / PENDING LIVE.** Provider identity, Case/PO, Archive continuation,
   hold ownership, canonical status request, retry, response-loss adoption, merge/remove exclusion, and exact
   completion acknowledgement are implemented. Live proof must remain under pinned test root `392761581105`.
8. **No invention — TESTED OFFLINE / PENDING RESIDUAL.** Negative fixtures remain blank. The runner authorises a
   write only for a single defensible source-backed claimant and classifies every other baseline row without a
   placeholder.
9. **Blank claimant stays Not Ready — TESTED OFFLINE / PENDING LIVE READBACK.** Canonical readiness rejects a
   blank required claimant regardless of stale status flags. Fresh residual readback must prove no blank active
   case remains in Review.
10. **Backup-first idempotent remediation — IMPLEMENTED / PENDING AUTHORITY AND APPLY.** The runner binds the raw
     plan, runner, environment, exact write/status allowlists, actual `pg_dump` bytes, PostgreSQL 16 restore
     counts/checksums, and named expiring approval. It preserves staff/current edits and emits before/after/source
     audit. Only the superseded initial plan has a dump/restore proof; v8 never reached backup, and no current
     backup authority exists.
11. **Complete residual ledger — IMPLEMENTED / PENDING LIVE OUTPUT.** The runner emits per-baseline outcome,
    append-only journal, final database readback, and a residual census with actionable failures. The actual
    external ledger does not yet exist.
12. **Offline tests — TESTED OFFLINE.** At the PR #93 boundary, API 773, orchestration 470, domain 1,196,
    SPA 525, parser 380, and Box webhook 252 tests were recorded passing; parser had 11 expected skips.
    On 2026-07-14 the focused current-main remediation suite passed 50/50. These tests prove the checked-in
    fail-closed contract but do not supersede the failed v8 plan audit.
13. **Independent fresh live proof — PENDING.** No fresh authorised case per repaired family or post-apply
    residual census has yet been verified by the independent ticket-verification role.

## Safety boundary

- No final cutover is authorised or attempted by TKT-150.
- No spreadsheet-dependent folder switch, production EVA call, Outlook write, Graph subscription mutation,
  service pause, production Archive-root write, or production-root adoption is allowed.
- Any Archive creation used for provider-recovery proof is constrained to pinned test root `392761581105` and
  must pass exact root/name/parent/path readback before database linkage.
- The external plan, source material, backup, approval, journal, and ledger contain sensitive operational data
  and must never enter Git or a linked worktree.

## How to complete verification

1. Keep the already-deployed PR #93 runtime/schema/API/orchestration/Box/parser boundary unchanged unless a
   reviewed runtime fix requires a new deployment.
2. Fix the remaining exact source-binding defect on current `main`, add fixtures for every v8 failure family,
   and merge it through normal CI/review.
3. Generate a brand-new full-baseline plan outside Git. Independently audit the counts, exact reference set,
   retained-source bindings, QDOS26079 trace, conflicts, absent sources, and failures. Stop unless the audit
   passes.
4. Only after audit PASS, take the plan-bound custom `pg_dump`, restore it on PostgreSQL 16, and match
   source/restored counts and
   SHA-256 table streams for `case_`, `field_level_provenance`, and `audit_event`.
5. Obtain a named human approval JSON bound to the exact plan, backup manifest, runner, environment, counts,
   and allowlists. Do not infer or fabricate approval.
6. Apply the claimant-only plan; retain the append-only journal and completed residual ledger outside Git.
7. Independently verify at least one fresh authorised case per repaired family plus the complete residual
   census, then update this file and move the ticket through `verify` to `done` only on evidence.

See [remediation-runbook.md](./remediation-runbook.md) for the exact controlled sequence.
See [the current handoff](../../../handoff/05-plan-005-tkt-150-remediation.md) for every attempt and branch/PR
disposition.
