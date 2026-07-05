# Go-live doc set index

The operator-facing cutover pack for taking `collisionspike` from its current **live-intaking but
not-yet-production-grade** state to a signed-off go-live. This set is the **P8 deliverable** of the
[go-live sprint](../../../GO_LIVE_SPRINT_PLAN.md); **go-live itself stays operator-triggered** — nothing
here flips a production switch on its own, every cutover action names an exact command or portal path for
**you** to run.

Live numbers, gate values, function counts, the mailbox set and Box/Graph state are **not re-embedded
here** — they live only in the registry
[architecture/live-environment.md](../../architecture/live-environment.md) (single source
[LIVE_FACTS.json](../../../LIVE_FACTS.json)). Every doc below links the registry rather than hard-coding a
number.

## The documents

| Doc | What it is |
|---|---|
| [runbook.md](./runbook.md) | The **ordered cutover procedure**: PAYG upgrade → staff app-roles → provider-corpus completion → Case/PO floor seeding ([sequence cutover](../case-po-sequence-cutover.md)) → archive roots + retro-gate flips → File-Request template + gate → EVA drag-drop live procedure → day-0 smoke → rollback. Each step has an exact command/portal path and a verifiable outcome. |
| [readiness-matrix.md](./readiness-matrix.md) | Every feature gate × current value × meaning × go-live target × owner — the single "is it safe to go" table. Gate **values** are read from the [registry](../../architecture/live-environment.md), not restated here. |
| [day0-smoke.md](./day0-smoke.md) | The **first-hour smoke pack** run immediately after cutover: one real email end-to-end (intake → parse → case → EVA fields → Box folder), sign-in, queue counts, Box upload → webhook → evidence → SPA. Pass/fail assertions per hop. |
| [rollback.md](./rollback.md) | How to **undo** a bad cutover step — per-gate flip-back commands, the pre-cutover pg_dump restore path, and the Box holding-folder reversal. Bounded, reversible, no data loss. |
| [support-playbook.md](./support-playbook.md) | Day-2 **on-call**: common failure → the KQL to confirm it → the fix. Covers Graph subscription expiry/renewal, `graph-webhook` 499/cold-start, parser/enrichment 5xx, Box facade non-2xx, DB connectivity. |
| [operator-checklist.md](./operator-checklist.md) | The **consolidated operator to-do**: every item only you can do (from [gated.md](../../gated.md) D1–D11 + A/B/C/E) rolled up with exact commands/portal paths and go-live ordering. The runbook references this; this is the flat "what's left for you" list. |

## How they relate

- **[operator-checklist.md](./operator-checklist.md)** is the flat backlog of operator-only actions;
  **[runbook.md](./runbook.md)** sequences the go-live-day subset of them into a dependency order.
- **[readiness-matrix.md](./readiness-matrix.md)** is the gate-state snapshot the runbook checks against
  before each flip; **[day0-smoke.md](./day0-smoke.md)** proves the flips took; **[rollback.md](./rollback.md)**
  reverses any that didn't.
- **[support-playbook.md](./support-playbook.md)** takes over once go-live is signed off — steady-state
  triage rather than cutover.

> **One standing deadline** (not a cutover step, but it gates everything): the subscription is on the
> **Azure Free Trial** and disables the whole stack at the ~30-day mark unless upgraded to Pay-As-You-Go —
> [gated.md A1](../../gated.md). Do this before go-live day.

Source sprint + phase context: [GO_LIVE_SPRINT_PLAN.md](../../../GO_LIVE_SPRINT_PLAN.md) (P8). Doc
conventions + precedence: [docs/MAINTENANCE.md](../../MAINTENANCE.md).
