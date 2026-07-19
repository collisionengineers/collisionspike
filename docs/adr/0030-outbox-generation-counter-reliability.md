# ADR-0030 — Archive mirroring runs on a per-evidence generation-counter outbox

**Status:** Proposed — pending operator approval (TKT-246).

## Decision

Staff-driven archive mirroring to the Box Archive is a durable-work problem, not a fire-and-forget
call. When a decision makes a blob-backed evidence row eligible to mirror — a staff exclusion
reversal, an evidence metadata edit, a merge survivor, provider or manual intake, or a captured staff
photo — the Data API records that work in an `archive_mirror_outbox` row inside the **same
transaction** as the decision, so the request commits atomically with the state that justifies it
([mirror-outbox.ts](../../services/data-api/src/features/archive/mirror-outbox.ts),
[190_archive_mirror_outbox.sql](../../database/baseline/190_archive_mirror_outbox.sql)).

Each row keys on `evidence_id` and carries two monotonic `bigint` counters:
`requested_generation` (bumped `+1` on every fresh request via `INSERT … ON CONFLICT (evidence_id)
DO UPDATE`) and `completed_generation`, under the invariant `0 <= completed <= requested`. A row is
pending while `requested_generation > completed_generation`. Two request seams exist:
`requestArchiveMirrorIfEligible` records a generation only when the row is currently eligible, while
`requestArchiveMirror` always records one — a staff photo held behind the image-safety gate parks an
*inert* generation that the drainer acknowledges immediately, and a later eligibility decision bumps
the counter again.

An eternal Durable-Functions singleton monitor is the only drainer. It lists pending rows whose
`next_attempt_at` has arrived, groups them by case, runs one idempotent Box pass per case, and then
acknowledges each row **only** through the API's row-specific verifier, which re-reads that exact
evidence row under a `case → evidence → outbox` lock and advances `completed_generation` only after
proving the row now carries a `box_file_id` (or is genuinely no longer mirror-eligible). An aggregate
`uploaded === total` count is never sufficient proof
([mirror-outbox-routes.ts](../../services/data-api/src/features/archive/mirror-outbox-routes.ts),
[archive-mirror-monitor.ts](../../services/orchestration/src/workflows/archive/archive-mirror-monitor.ts)).
A partial, skipped, or failed Box pass defers each of its rows with `attempt_count++` and capped
exponential backoff (`30·2^min(n,6)` s, ≤ 3600 s). One incomplete result is currently exempt from
that backoff: when an aggregate pass reads `uploaded === total` but the row-specific verifier still
finds no `box_file_id`, the completion route returns `{ completed: false, pending: true }` at HTTP
200, which the monitor does not treat as a defer — so the row stays pending and is simply re-attempted
on the next monitor wake with `attempt_count` and `next_attempt_at` unchanged (a known archive-mirror
gap; the sibling provider-archive monitor already defers on this `completed:false` signal, and
aligning archive-mirror is pending). The DB outbox is the durable source of truth; no separately
provisioned queue exists.

## Rationale

A monotonic per-evidence generation counter, not a boolean "dirty" flag, is what makes
re-eligibility safe under concurrency. A staff reversal that lands while a drain pass is in flight
bumps `requested_generation` past the generation the drainer is about to acknowledge; the ack
advances `completed_generation` only to `min(seen, requested)`, so the newer request is never lost
and the row stays pending for the next wake. Recording the request in the eligibility-changing
transaction closes the "committed the state but crashed before enqueuing" gap a separate queue write
would open. Verifying each row's own `box_file_id` rather than trusting a batch count means a partial
or misreported Box pass can never mark unmirrored evidence done. Making the outbox itself the queue
keeps the system on the Postgres it already runs, with no broker to provision, authorize, or lose.

## Consequences

The Data API is the only writer of both counters and the only component that may acknowledge a
generation; the orchestration monitor and its adapter are transport, not authority
([archive-mirror-api.ts](../../services/orchestration/src/adapters/archive-mirror-api.ts)). Any new
trigger that can make evidence archive-eligible MUST request a generation in the same transaction, or
that evidence silently never mirrors. The row-specific `box_file_id` proof, the `completed <=
requested` check constraint, and the `case → evidence → outbox` lock order must survive any refactor;
loosening them reintroduces false-complete or lost-update failures. Retry backoff is capped but
**unbounded for ordinary rows** — only `manual_intake` evidence dead-letters (at
`ARCHIVE_MIRROR_MAX_ATTEMPTS` = 8), and a dead-letter enqueues a case status recompute in the same
commit so Review never rests on a stale archive state. The outbox is RLS-`FORCE`d to `staff`/`admin`
via `app.role`, and its drainer role holds no `DELETE` grant; rows are removed only by `ON DELETE
CASCADE` when the evidence or case is deleted, keeping the Archive additive per
[ADR-0012](./0012-box-centric-intake-additive-hybrid.md)
([900_constraints.sql](../../database/baseline/900_constraints.sql)). The same pending/complete/defer
generation shape is the platform convention for sibling durable lanes (provider-archive mirroring;
Box file-request maintenance is a single-drain variant); a future move to share their monitor
lifecycle (TKT-264) amends this record and must preserve each lane's protocol.
