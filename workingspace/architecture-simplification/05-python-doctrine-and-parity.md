# 05 — Python runtime doctrine and cross-language parity → PLAN-011

**Status: non-binding working draft. Superseded on distillation.**
Distils into **PLAN-011**. One new ADR (Python packaging doctrine; next free number at mint, likely
**0032**). Runs **last** — PLAN-009's helper-app assessment can change its answer. Validated against `main`
at `de9c3f9d`.

## Problem

Two cross-language duplications remain after PLAN-007/008 have consolidated the TypeScript side:

- **Finding E** — every Python function service re-implements a `_CachedToken` dataclass + locked
  `get_token(force_refresh)` + bounded 429/5xx backoff (`box-webhook/box_client.py`,
  `eva-sentry/eva_client.py`, `vehicle-enrichment/dvsa_client.py` + `dvla_client.py`, MSI variants in
  `box-webhook/blob_source.py` + `data_api_client.py`). But `services/functions/README.md` **declares** each
  service "independently packaged with its own contract, tests, requirements, and deployment inputs." So
  this is a *doctrine*, not an oversight — and the doctrine must be affirmed or reversed before touching the
  duplication.
- **Finding H** — the vendored parser engine (`services/functions/parser/cedocumentmapper_v2`) is a second
  source of truth for VRM / case-type / EVA-field rules that `@cs/domain` owns in TypeScript. Cross-language,
  so not shareable; already partly guarded by `*_vendored_in_sync.py` tests.

## Outcome

The Python packaging doctrine is a recorded, deliberate decision (not an accident), and the unavoidable
cross-language duplication (H, and E if independence is affirmed) is converted from silent drift risk into
**checked parity**.

## Scope

1. **Decision ticket — affirm or reverse "independently packaged" (new ADR).**
   **Recommended default: affirm independence + add copies-in-sync guard tests.** Seven helper apps at 1–16
   functions each do not justify the coupling and deployment-blast-radius of a shared Python package feed;
   the finding-H mechanism (in-sync guard tests, already proven in-repo) converts the `_CachedToken`/retry
   duplication from a drift risk into a checked invariant at a fraction of the cost. Record the reasoning as
   a new ADR so the next agent doesn't re-litigate it. **This is a genuine decision, not a foregone
   conclusion** — PLAN-009's helper-app assessment (item 5) is an input: if that assessment recommends
   collapsing seven apps into two, the sharing calculus changes and a shared module may become worthwhile.
   That is why this plan runs last.
2. **Implement the chosen outcome** — either the guard tests (affirm path) or a minimal shared Python
   module (reverse path).
3. **Extend parity coverage for the vendored parser (H)** — document and widen the `*_vendored_in_sync.py`
   guard so the VRM / case-type / EVA-field rules that exist in both `@cs/domain` and the vendored engine
   are pinned against silent divergence.

## Locked decisions

- **The vendored parser stays vendored** (ADR-0018): functional changes are made in the authoring repo,
  re-vendored, and drift-guarded. This plan only *widens the parity guard*, it does not touch the
  vendor-lock mechanism.
- **No cross-language shared module** for finding H — it is not shareable; parity guards only.

## Proposed tickets (rescan IDs at mint; ~3)

Decision + ADR · implement outcome · extend vendored-parity guards.

## Dependencies / gates

- **PLAN-009's helper-app consolidation assessment** — a real input to ticket 1's decision. This plan is
  deliberately last.
- **PLAN-007** — if the reverse path is ever chosen, the Python module should mirror the TS package's shape
  for consistency (not a hard dependency on the affirm path).

## Risks

- **Deciding before the assessment** — mitigated by ordering this plan last.
- **Guard tests that pin the wrong thing** — a parity test asserting identical *implementation* rather than
  identical *behaviour* would fight legitimate refactors. Mitigation: pin observable outputs
  (token-cache expiry behaviour, normalized VRM/case-type results on a fixture corpus), not internals.

## Verification

- The Python service pytest suites plus the new parity/guard tests pass under `verify-all.mjs`.
- A synthetic divergence (change a VRM rule in one side only) is caught by the guard.
