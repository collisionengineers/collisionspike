# Changes — TKT-267: Decide and record the Python packaging doctrine

## Status

Decided 2026-07-20 on branch `plan011/tkt-267-269-doctrine-parity`. Decision + ADR only; no runtime
change, no live write.

## Decision

**Affirm independence.** Each Python function service stays independently packaged; there is no shared
Python runtime module. Cross-service duplication is converted to *checked behaviour*: a test-only
conformance harness pins the per-client auth/retry policies (TKT-268), and a cross-language parity guard
pins the vendored-parser VRM and Case/PO rules against `@cs/domain` (TKT-269).

## Files added / changed

- `docs/adr/0032-python-independent-packaging.md` (new) — records the doctrine as **Accepted**, with the
  reasoning (the runtime clients are genuinely different auth mechanisms; TKT-256 recommends against
  *infrastructure* consolidation and treats code/runtime sharing as separable, pointing to independence).
- `docs/adr/README.md` — adds the 0032 index row (Accepted).
- `services/functions/README.md` — the "independently packaged" line is reaffirmed with a "Decision of
  record" pointer to ADR-0032.

## Acceptance mapping

- **A1.** ADR-0032 records the doctrine (affirm independence) with reasoning, at the next free number.
- **A2.** The ADR explicitly cites PLAN-009's TKT-256 assessment and states how its outcome affected the
  call (it recommended against infra consolidation and separated code from infra sharing → independence).
- **A3.** The ADR names the follow-on mechanisms: TKT-268's conformance harness and TKT-269's parity guard.
- **A4.** `services/functions/README.md` is reconciled (reaffirmed doctrine + ADR pointer); `check:docs`
  passes.
- **A5.** No live write; no runtime behaviour change.
