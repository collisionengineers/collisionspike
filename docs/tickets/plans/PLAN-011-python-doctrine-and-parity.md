---
id: PLAN-011
title: Python runtime doctrine and cross-language parity
status: active
tickets: [TKT-267, TKT-268, TKT-269]
depends-on: [TKT-256]
---

# PLAN-011 — Python runtime doctrine and cross-language parity

## Outcome

The Python packaging doctrine is a recorded, deliberate decision rather than an accident, and the two
cross-language duplications that remain after the TypeScript-side consolidation are converted from silent
drift risk into **checked parity**: the divergent per-service token/backoff reimplementations against a shared
behavioural conformance contract, and the vendored parser's rules against `@cs/domain`.

## Locked decisions

- **The vendored parser stays vendored** (ADR-0018): functional changes are made in the authoring source,
  re-vendored, and drift-guarded. This plan only *widens the parity guard*; it does not touch the vendor-lock
  mechanism.
- **No cross-language shared module** for the parser rules (finding H) — they are not shareable; parity guards
  only.
- **Pin observable behaviour, not implementation.** Guards assert token-cache expiry behaviour, backoff on
  429/5xx (and `Retry-After` where a client claims it), and normalized VRM / case-type / EVA-field outputs on
  a fixture corpus — never identical internals, which would fight legitimate refactors.
- **The token/backoff duplication is non-uniform** (verified read-only 2026-07-19): the six services carry
  *divergent* reimplementations across different auth mechanisms (JWT assertion, client-credentials, MSI,
  API-key) — some with the full `_CachedToken`+`get_token`+backoff triad, some missing the cache, some missing
  the bounded backoff. Because they are legitimately different, a single shared helper would force artificial
  uniformity; this plan affirms independence and pins *behaviour* instead. This scope covers only the
  cross-language duplication remaining after PLAN-007/008.

## Sequence

1. TKT-267 is the decision ticket: affirm or reverse `services/functions/README.md`'s "independently packaged"
   doctrine, recording the reasoning in a new ADR. **Recommended default: affirm independence** — the six
   focused services do not justify the coupling and deployment blast radius of a shared Python package feed,
   and the non-uniform, auth-divergent token flows make a shared helper a poor fit; instead convert the
   duplication to a checked behavioural invariant. PLAN-009's TKT-256 helper-app consolidation assessment is a
   real input — if it recommends collapsing the apps, the sharing calculus changes.
2. TKT-268 implements the chosen outcome: on the affirm path, a shared **behavioural conformance suite** each
   service's token/backoff code is run against (cache honours expiry; bounded backoff honours 429/5xx and
   `Retry-After` where claimed) — capturing the divergent variants (including `location-assist/ai_reasoning.py`,
   which mints without a cache or backoff) as explicit, tested behaviours; on the reverse path, a minimal
   shared Python module mirroring PLAN-007's package shape.
3. TKT-269 widens the vendored-parser parity coverage: add a cross-language **behavioural** parity guard
   between the vendored parser's VRM / case-type / EVA-field rules and `@cs/domain`, pinning normalized
   outputs on a fixture corpus (which catches the known VRM special-case divergence), alongside the existing
   engine-in-sync and schema-in-sync guards.

## Gates

- **PLAN-009's TKT-256** (helper-app consolidation assessment) is a real input to TKT-267's decision — this
  plan is deliberately last in the estate track.
- Soft link to **PLAN-007**: if the reverse path is ever chosen, the Python module mirrors the
  `@cs/server-runtime` shape for consistency (not a hard dependency on the affirm path).
- New ADR (Python packaging doctrine) is authored by TKT-267; its number is allocated at authoring (expected
  0032, after PLAN-007's 0031) and is not pre-assigned.

## Close-out

The plan closes only when all members are `done`: the packaging doctrine is recorded in a new ADR, the
divergent token/backoff behaviours are pinned by a conformance suite (or replaced by a shared module), the
vendored parser's rules are behaviourally parity-checked against `@cs/domain`, a synthetic divergence (a
changed VRM rule on one side, or a token cache that ignores expiry) is caught by the guards, and the Python
pytest suites plus the new guards pass under `verify-all.mjs`. No member performs a live write.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/3 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 3 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
| [TKT-267](../backlog/TKT-267-python-packaging-doctrine-decision/TKT-267-python-packaging-doctrine-decision.md) | backlog | Decide and record the Python packaging doctrine |
| [TKT-268](../backlog/TKT-268-python-token-backoff-conformance-suite/TKT-268-python-token-backoff-conformance-suite.md) | backlog | Implement the Python token/backoff conformance suite |
| [TKT-269](../backlog/TKT-269-vendored-parser-cross-language-parity-guard/TKT-269-vendored-parser-cross-language-parity-guard.md) | backlog | Widen the vendored parser to cross-language behavioural parity |
<!-- /GENERATED:PROGRESS -->
