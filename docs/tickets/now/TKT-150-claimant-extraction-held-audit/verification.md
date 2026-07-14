# Verification — TKT-150: Restore claimant-name extraction and remediate affected held cases

## Verdict

PENDING

The previous source-level failures are implemented and tested offline. The ticket cannot be marked verified or
done until a fresh deployed-fingerprint plan, plan-bound backup/restore, named approval, fill-only live apply,
complete residual ledger, and independent fresh-case/family proof exist.

## Acceptance evidence — 2026-07-14

1. **Census — PENDING LIVE.** The dated read-only census records the historical population and dimensions, but
   it is not apply authority. The v2 runner produces a fresh repeatable-read full baseline grouped by provider,
   source format, intake path, historical-parser availability, and earliest source.
2. **QDOS26079 trace — PARTIAL LIVE EVIDENCE.** The dated trace identifies the retained source and first observed
   loss family without committing live identifiers or personal data. It must be regenerated against the fresh
   deployed fingerprint and included in the external plan/ledger.
3. **Failure-family fixtures — TESTED OFFLINE / PENDING CENSUS COMPLETENESS.** Sibling-first immutable parser
   fixtures cover all currently known families through `engine-v2.24`. A fresh census must confirm that no new
   family is absent.
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
    audit.
11. **Complete residual ledger — IMPLEMENTED / PENDING LIVE OUTPUT.** The runner emits per-baseline outcome,
    append-only journal, final database readback, and a residual census with actionable failures. The actual
    external ledger does not yet exist.
12. **Offline tests — TESTED OFFLINE.** On the final combined tree: API 773, orchestration 470, domain 1,196,
    SPA 525, remediation runner 29, parser 380, and Box webhook 252 tests pass; parser has 11 expected skips.
    All TypeScript builds, the independent diff audit, `git diff --check`, and the aggregate offline verifier
    pass (`8 passed, 0 failed, 13 skipped`; the skips are retired/live-optional gates or per-Function venv gates
    covered by the direct Python runs above).
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

1. Apply the additive schema before API/orchestration deployment; deploy API, Box webhook, orchestration, and
   parser; rerun the idempotent delta and verify no eligible legacy row remains unclassified.
2. Prove the deployed parser fingerprint, Function registrations, outbox singleton, and pinned-root Box
   readback without switching production roots.
3. Generate the fresh full-baseline v2 plan outside Git and review its counts, families, QDOS26079 trace,
   conflicts, absent sources, and failures.
4. Take the plan-bound custom `pg_dump`, restore it on PostgreSQL 16, and match source/restored counts and
   SHA-256 table streams for `case_`, `field_level_provenance`, and `audit_event`.
5. Obtain a named human approval JSON bound to the exact plan, backup manifest, runner, environment, counts,
   and allowlists. Do not infer or fabricate approval.
6. Apply the claimant-only plan; retain the append-only journal and completed residual ledger outside Git.
7. Independently verify at least one fresh authorised case per repaired family plus the complete residual
   census, then update this file and move the ticket through `verify` to `done` only on evidence.

See [remediation-runbook.md](./remediation-runbook.md) for the exact controlled sequence.
