# Verification — TKT-267: Decide and record the Python packaging doctrine

## Verdict

PASS — 2026-07-20. Decision recorded; no runtime change.

## Evidence

- **A1.** `docs/adr/0032-python-independent-packaging.md` exists, is **Accepted 2026-07-20**, and records
  the doctrine (affirm independent packaging; duplication checked not shared) with its reasoning.
- **A2.** The ADR's Rationale cites the [TKT-256 assessment](../../../operations/helper-app-consolidation-assessment.md)
  and states its effect: TKT-256 recommends against infrastructure consolidation and explicitly treats
  code/runtime sharing as separable from infra sharing, so the decision rests on the code evidence, which
  favours independence.
- **A3.** The ADR names the follow-on mechanisms — TKT-268's test-only conformance harness and TKT-269's
  cross-language parity guard — and the parity widening.
- **A4.** `services/functions/README.md`'s doctrine line is reaffirmed with a "Decision of record" pointer
  to ADR-0032, and the ADR is listed in `docs/adr/README.md`. `npm run check:docs` passes.
- **A5.** No live write; no runtime behaviour changed (docs only).

## Commands

- `npm run check:docs` → PASS (links/orphans/leakage/authority 0).

## Pending / gaps

None. TKT-268 (conformance harness) and TKT-269 (parity guard) implement the affirm path this ADR selects;
TKT-269 lands in the same PR, TKT-268 follows.

## How to re-verify

Read `docs/adr/0032-python-independent-packaging.md`, confirm Status is Accepted and the README pointer
resolves; `npm run check:docs`.
