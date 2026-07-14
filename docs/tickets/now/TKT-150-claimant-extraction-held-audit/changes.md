# Changes — TKT-150: Restore claimant-name extraction and remediate affected held cases

## Status

The runtime/schema/API/orchestration/Box/parser boundary and initial fail-closed remediation tooling were merged,
deployed, and verified through PR #93. PRs #94–#96 hardened the offline runner without changing the deployed
runtime. The latest 156-case v8 read-only plan completed but failed its independent audit, so the runner is not
complete against all observed live retained-source shapes. V8 is superseded; no current plan authority, backup,
approval, apply, journal, or ledger exists. No final cutover, production EVA call, Outlook write, production
Archive-root switch, or production Archive write is part of this ticket execution.

## Consolidated baseline

- The historical TKT-150 branches were compared. Current implementation reached `main` through PRs #93–#96.
  After the handoff was pushed, the exact historical heads were re-verified in the hashed recovery bundle and
  the stale local/remote branches and merged closeout worktree were removed.
- Every generated plan so far is explicitly superseded and is not an apply artifact. The initial 151-case plan
  has the only plan-bound backup/restore proof, but both plan and backup are obsolete and must not be reused.
- Raw source, plan, backup, approval, journal, and ledger artifacts are rejected when their paths resolve
  inside this repository or any linked worktree.
- Current parser vendor lock is the immutable sibling tag `engine-v2.24`; the parser Function now exposes a
  function-key-protected content fingerprint for live revision proof.
- PR #93 deployed the runtime/schema/API/orchestration/Box/parser boundary. PRs #94 (`8f8f31cc`), #95
  (`72266795`), and #96 (`d62260ca`) changed only the external runner and tests.

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

The v8 live-plan audit exposed an unresolved source-identity defect despite the checked-in contract suite:
18 tokenized retained-text rows had no exact raw-email binding, root-level binding remained zero, and QDOS26079
still failed at `source_processing`. The audit also needs to distinguish legitimate baseline growth from an
incomplete reference set. No future plan may become authority until a new independent audit passes.

## Verification so far

- At the PR #93 merge/deployment boundary, the recorded suites passed: API **773**, orchestration **470**,
  domain **1,196**, SPA **525**, parser **380** with **11 expected skips**, and Box webhook **252** tests.
- On 2026-07-14, `npm run test:tkt150-remediation` passed **50/50** on current `main`.
- The previously recorded TypeScript builds and aggregate offline verifier passed. Those offline gates do not
  overrule the later v8 live-plan audit failure.
- Coverage includes claimant atomicity and conflicts; merge/source truth; exact replay; provider recovery and
  outbox locking; document/body precedence; pinned-root folder verification; blank-claimant readiness; honest
  unknown-source rendering; Box readback authority; parser fingerprinting; and the plan/backup/apply boundary.

The authoritative acceptance-by-acceptance state is in [verification.md](./verification.md). Live acceptance
remains pending until the source-binding defect is fixed, a brand-new plan passes audit, and a current
backup/approval, apply, residual census, and independent proof exist. The complete attempt and repository
handoff is [`05-plan-005-tkt-150-remediation.md`](../../../handoff/05-plan-005-tkt-150-remediation.md).
