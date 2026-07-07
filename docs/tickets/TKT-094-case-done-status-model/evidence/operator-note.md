# Operator note — case `done` lifecycle (anchor)

The case lifecycle the UI exposes is *not ready → review → held*, but there is no home for a case once
work on it is finished.

**What "done" means (operator's clarification).** `done` is a **genuinely new terminal state that comes
*after* `eva_submitted`** — "the CE report has been delivered back to the work provider" — giving
lifecycle tracking *beyond* the EVA handoff. It is triggered by any of:
- (a) a **sent email from a CE mailbox (info@ / desk@ / engineers@) to the case's work provider** — the primary signal;
- (b) a **CE report PDF uploaded into the case's Box folder** — the alternative signal;
- (c) *(later / gated)* **EVA Sentry report-retrieval polling** flipping `eva_submitted → done`.

**Two corrections the operator made:**
- `eva_submitted` fires **automatically** on the "Export for EVA" click (not via a separate confirm).
- `box_synced` as a lifecycle **end**-state is stale/misleading — Box folders are now created at
  **intake**, not at the end. Keep the enum value for history/audit but stop portraying it as terminal.

**Placement:** a separate **Completed/Archive** area + global search, **not** a 4th work-queue.

> The full, code-referenced A–E plan is preserved verbatim alongside this note in
> [PLAN-case-done-lifecycle.md](./PLAN-case-done-lifecycle.md). TKT-095 (detectors) and TKT-096
> (Completed view + search) carry their phase sections.
