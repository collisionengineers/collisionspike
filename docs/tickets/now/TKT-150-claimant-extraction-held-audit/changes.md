# Changes — TKT-150: Restore claimant-name extraction and remediate affected held cases

## Status

The implementation and fail-closed remediation tooling are complete offline. Live deployment, the fresh
immutable census/plan, the plan-bound backup and named approval, the fill-only apply, and independent live
verification remain pending. No final cutover, production EVA call, Outlook write, production Archive-root
switch, or production Archive write is part of this ticket execution.

## Consolidated baseline

- The three historical TKT-150 branches were compared and only the current remediation runner and non-PII
  evidence were carried onto current `main`.
- The earlier 134-case `engine-v2.23` plan is explicitly superseded and is not an apply artifact.
- Raw source, plan, backup, approval, journal, and ledger artifacts are rejected when their paths resolve
  inside this repository or any linked worktree.
- Current parser vendor lock is the immutable sibling tag `engine-v2.24`; the parser Function now exposes a
  function-key-protected content fingerprint for live revision proof.

## Claimant source and conflict handling

- Document claimant values outrank conservative body-text candidates. Differing retained candidates are
  persisted as unresolved conflicts instead of overwriting the saved claimant or disappearing.
- Claimant value plus provenance is atomic. A claimant provenance failure now aborts the transaction; legacy
  non-claimant provenance remains best-effort but emits a diagnostic instead of failing silently.
- Create, exact-message replay, retro reconstruction, later-document update, and merge share the same
  claimant-selection and stable source-reference semantics.
- Merge carries current claimant provenance to the survivor, fills only a blank survivor, and exposes a
  differing source value as a conflict. A legacy value whose origin was never recorded uses the explicit
  `unknown` provenance choice, never a fabricated staff source.
- The SPA keeps the saved value visible and shows each conflicting value with controlled handler-facing source
  wording. Stored internal source labels are not used for conflict summaries, and vehicle-source wording does
  not expose banned implementation/service names.

## Replay and provider recovery

- Exact Internet Message-ID ownership is the replay authority. Repairable cases replay through the shared
  parser/provider seam; terminal owners return `already_ingested` with no downstream mutation.
- Provider recovery is two-phase and idempotent: the database transaction locks the case and provider,
  adopts or mints a valid Case/PO, moves only an intake-owned hold to `provider_archive_pending`, and requests
  a durable Archive generation.
- The eternal orchestration monitor consumes every pending generation through the existing fail-closed folder
  seam. It always verifies the pinned test root `392761581105`, exact Case/PO folder name, direct parent/path,
  and first-wins database stamp before acknowledging completion.
- Merge and remove refuse to mutate a case while a provider-Archive generation or legacy pending hold is in
  flight. Manual hold/unhold changes cannot suppress pending Archive work. Completion clears only the
  provider-owned hold and requests canonical status recomputation.
- Retro reconstruction now applies parser/provider recovery to an already-linked case as well as a newly
  created one; response-loss retries adopt the same verified folder instead of duplicating it.

## Remediation runner

`scripts/live/remediate-blank-claimants.mjs` implements a v2 claimant-only contract:

- repeatable-read census across active Held, Not Ready, and Review cases;
- deployed parser fingerprint binding and byte hashes for every retained document/body actually read;
- explicit `repair`, `absent_in_source`, `conflicting`, or `failed` classification;
- raw plan, runner, environment, exact per-case allowlists, backup manifest, actual `pg_dump`, PostgreSQL 16
  restore proof, and named unexpired approval binding;
- fill-only claimant writes, source provenance, before/after audit, and durable canonical status-recompute
  request; and
- append-only journal plus a complete residual census/ledger, including actionable no-write failures.

The [controlled runbook](./remediation-runbook.md) fixes deployment order and the external-artifact/approval
boundary. The runner cannot perform the blocked final cutover.

## Verification so far

- Final current-tree suites pass: API **773**, orchestration **470**, domain **1,196**, SPA **525**, remediation
  runner **29**, parser **380** with **11 expected skips**, and Box webhook **252** tests.
- All TypeScript builds pass. The aggregate offline verifier reports **8 passed, 0 failed, 13 skipped**; its
  per-Function venv skips are covered by the direct parser and Box runs above, while the other skips are
  retired Power Platform gates or explicitly live/optional gates.
- The independent diff audit and whole-tree `git diff --check` pass. The audit found no unresolved source, SQL,
  race, idempotency, personal-data, or fail-closed safety defect.
- Coverage includes claimant atomicity and conflicts; merge/source truth; exact replay; provider recovery and
  outbox locking; document/body precedence; pinned-root folder verification; blank-claimant readiness; honest
  unknown-source rendering; Box readback authority; parser fingerprinting; and the plan/backup/apply boundary.

The authoritative acceptance-by-acceptance state is in [verification.md](./verification.md). Live acceptance is
deliberately still pending until the fresh plan, backup, approval, apply, residual census, and independent proof
exist.
