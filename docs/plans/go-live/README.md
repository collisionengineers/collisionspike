# Go-live doc set index

The operator-facing **future cutover specification** for taking `collisionspike` from its current
**live-intaking but not-yet-production-grade** state to a signed-off go-live. It is not yet executable:
Precondition 0 in the runbook lists missing engineering capabilities whose commands/artifacts intentionally
do not exist. Existing command examples are reference material only; nothing here flips a production switch
or grants authority.

> **The cutover is currently blocked; this pack is planning material, not execution authority.** TKT-178
> cannot open a live window until one approved pack contains the signed/checksummed job spreadsheet,
> authenticated contract-verified production EVA API evidence, and the exact production Archive root with
> proven explicit write/rename/merge/retarget authority, plus backup/restore proof, a frozen approved
> zero-write ledger hash and named approval. Manual EVA drag-drop and test, mirror, configured-default or
> Viewer-only Archive roots are not substitutes.
>
> **The commands are reference material, not approval.** No live mutation is authorised by this doc pass.
> TKT-178 additionally needs an independently verified, version-locked executor/dependency manifest and its
> signed run/ledger/artifact hashes, window and fence token. Outlook remains read-only. The two genuine,
> ledger-listed proofs are one read-only-nominated pending ingress instruction and one pre-existing EVA-ready
> case, each under its own one-shot lease; no ad hoc Graph renewal, retro starter or disposable work.

Live numbers, gate values, function counts, the mailbox set and Box/Graph state are **not re-embedded
here** — they live only in the registry
[architecture/live-environment.md](../../architecture/live-environment.md) (single source
[LIVE_FACTS.json](../../../LIVE_FACTS.json)). Every doc below links the registry rather than hard-coding a
number.

## The documents

| Doc | What it is |
|---|---|
| [runbook.md](./runbook.md) | The **blocked future cutover procedure**: versioned prerequisites → signed-sheet roster + complete read-only union → approved zero-write ledger/backups/two canary nominations → named fenced window → exact DB/Archive actions → root commit last → one ingress placement proof + one authenticated EVA-ready-case submission → day-0 hard-green, pre-EVA inverse, or post-EVA forward recovery. |
| [readiness-matrix.md](./readiness-matrix.md) | Every feature gate × current value × meaning × go-live target × owner — the single "is it safe to go" table. Gate **values** are read from the [registry](../../architecture/live-environment.md), not restated here. |
| [day0-smoke.md](./day0-smoke.md) | The **first-hour smoke pack** for the same two immutable, journaled proof operations: exact ingress identity, unattended Graph evidence, exact Archive object+parent, authenticated EVA-ready-case submission, UI/counts and independent ledger/queue reconciliation. A later ordinary-work upload supplies File Request evidence; the bounded window does not wait for or manufacture one. Archive and EVA cannot be amber. |
| [rollback.md](./rollback.md) | Recovery boundaries: a durable typed LIFO inverse journal before EVA dispatch, and persisted-correlation forward recovery after EVA accepts or may have accepted. No whole-store rewind of unrelated work. |
| [support-playbook.md](./support-playbook.md) | Day-2 **on-call**: common failure → the KQL to confirm it → the fix. Covers Graph subscription expiry/renewal, `graph-webhook` 499/cold-start, parser/enrichment 5xx, Box facade non-2xx, DB connectivity. |
| [operator-checklist.md](./operator-checklist.md) | The consolidated inventory of operator inputs/decisions plus missing engineering prerequisites. Existing mechanics may have portal paths or illustrative commands; unimplemented cutover commands intentionally do not exist. |

## How they relate

- **[operator-checklist.md](./operator-checklist.md)** is the flat backlog of operator-only actions;
  **[runbook.md](./runbook.md)** sequences the go-live-day subset of them into a dependency order.
- **[readiness-matrix.md](./readiness-matrix.md)** is the gate-state snapshot the runbook checks against
  before each flip; **[day0-smoke.md](./day0-smoke.md)** proves the exact run and both canaries; before EVA dispatch
  **[rollback.md](./rollback.md)** pops typed inverses, while accepted/unknown EVA results recover forward.
- **[support-playbook.md](./support-playbook.md)** takes over once go-live is signed off — steady-state
  triage rather than cutover.

> **One standing deadline** (not a cutover step, but it gates everything): the subscription is on the
> **Azure Free Trial** and disables the whole stack at the ~30-day mark unless upgraded to Pay-As-You-Go —
> [gated.md A1](../../gated.md). Do this before go-live day.

Source sprint + phase context: [GO_LIVE_SPRINT_PLAN.md](./README.md) (P8). Doc
conventions + precedence: [docs/MAINTENANCE.md](../../MAINTENANCE.md).
