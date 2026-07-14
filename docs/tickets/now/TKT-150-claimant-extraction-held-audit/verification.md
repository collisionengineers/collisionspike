# Verification — TKT-150: Restore claimant-name extraction and remediate affected held cases

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Reproduce every fixture family, inspect QDOS26079's trace, then repeat the live missing-claimant census and prove each residual classification.

## Independent verification update — 2026-07-14

### Verdict

FAILED

### Evidence

1. **Acceptance 1 — PENDING.** No reproducible active-case census groups blank claimant values by
   provider, source format, intake path, parser version and earliest retained source. PostgreSQL was
   unread, so the population could not be reconstructed.
2. **Acceptance 2 — PENDING.** No retained QDOS26079 source-to-first-loss trace exists. Read-only
   telemetry searches returned no QDOS26079/claimant result rows because logs omit response bodies.
3. **Acceptance 3 — PENDING.** Seven permanent fixture families and tests exist. Official annotated
   tags `engine-v2.17` through `engine-v2.24` resolve to expected remote commits; current vendor is
   immutable `engine-v2.24` and independently passed its 36-file pin check. Without census/QDOS trace,
   coverage of every observed live family is unproved.
4. **Acceptance 4 — TESTED (offline).** Fixtures cover ordinary prose/provider labels and reject
   handlers, repairers, third parties, insured/policyholder wording, placeholders and bare
   representation wording. Current `engine-v2.24` claimant blob matches repaired `engine-v2.22`.
   Recorded runs are claimant 72 passed; sibling 522 passed/5 skipped/5 known baseline failures;
   wrapper focused 292 passed/11 environment skips; wrapper full 367 passed/11 skipped/1 unchanged
   baseline failure. Live revision remains unproved.
5. **Acceptance 5 — FAILED.** Explicit-label precedence is covered offline, but a differing candidate
   against a nonblank claimant is silently skipped by `applyParserFields`; no claimant conflict/audit
   becomes visible for review.
6. **Acceptance 6 — PENDING.** Intake prefers document claimant with conservative email fallback; API
   maps/persists a blank claimant with source. No complete retained create+merge+replay+later-document
   matrix proves identical claimant/source across paths.
7. **Acceptance 7 — FAILED.** Current source explicitly limits provider recovery to filling missing
   `work_provider_id`; it does not clear `on_hold`, mint/adopt Case/PO, or create/adopt Archive state,
   and calls that a separate capability. Provider recovery is not an idempotent completion transition.
8. **Acceptance 8 — PENDING.** Fixtures keep placeholders/signatures blank and readiness supplies a
   missing-claimant reason, but no census/residual accounting proves all defensible claimants populated
   and every remaining blank explained.
9. **Acceptance 9 — TESTED (offline).** Canonical readiness tests prove a QDOS26079-shaped blank remains
   Not Ready, never Review, and is not overridden by stale `ready_for_eva`. No live readback exists.
10. **Acceptance 10 — FAILED.** No TKT-150 backup/checksum, idempotent remediation/dry-run,
    staff-edit-preservation proof or before/after/source audit exists.
11. **Acceptance 11 — FAILED.** No residual ledger accounts for every pre-run missing-claimant case.
12. **Acceptance 12 — PENDING.** Parser coverage is strong but was not independently rerun here;
    missing census prevents the “all observed layouts” claim and no complete replay matrix exists.
13. **Acceptance 13 — PENDING.** No fresh live case per repaired family or post-run census exists.
    Parser is Running and healthy over 168h (805 parse, 713 classify-email, 467 extract-images, 266
    explode-eml HTTP 200s), but telemetry does not fingerprint it. Registry still says
    `engine-v2.10`; the July 13 restart does not prove `engine-v2.22+`.

### Pending / gaps

- Implement review-visible claimant conflicts.
- Implement idempotent provider recovery that recomputes hold/readiness, mints or adopts Case/PO, and
  creates/adopts Archive state.
- Build the backup-first remediation and complete residual ledger.
- Produce the active census, QDOS26079 trace, deployed-parser fingerprint, path-equivalence matrix and
  per-family live proof.
- PostgreSQL, signed-in case detail, source documents, Outlook intake and Archive state were unread;
  no live mutation was attempted.

### How to re-verify

1. Implement conflict visibility and complete provider-recovery transaction.
2. Deploy a fingerprinted immutable parser revision and update the registry.
3. Retain a frozen, dimensioned pre-remediation census/source manifest and complete fixture inventory.
4. Trace QDOS26079 from retained source through parser, orchestration, persistence and replay.
5. Produce backup/checksum and deterministic dry-run; after separate authorization, retain per-case
   before/after/source audit and complete residual ledger.
6. Use one authorized fresh case per family to prove create, merge, replay and later-document behavior;
   blanks remain Not Ready and conflicts visible.
7. Rerun claimant/parser/wrapper/readiness/replay suites against final vendor and retain results.

### Confidence + unread surfaces

**High confidence** in FAILED: acceptances 5 and 7 are contradicted by source, while 10–11 lack their
implementation/artifacts. Immutable vendor/offline behavior is strong. Live population health and
deployed parser revision have low confidence because PostgreSQL, case detail, sources and response
bodies were unavailable. Verification was read-only.
