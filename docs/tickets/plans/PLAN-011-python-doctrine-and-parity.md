---
id: PLAN-011
title: Python runtime doctrine and cross-language parity
status: active
tickets: [TKT-267, TKT-268, TKT-269]
depends-on: [PLAN-009]
---

# PLAN-011 — Python runtime doctrine and cross-language parity

## Outcome

The Python packaging doctrine is a recorded, deliberate decision rather than an accident, and the two
remaining duplication risks are converted from silent drift into **checked behaviour**: the divergent
per-client Python authentication/retry policies against an explicit contract, and the independently
implemented vendored-parser rules against their `@cs/domain` counterparts.

## Locked decisions

- **The vendored parser stays vendored** (ADR-0018): functional changes are made in the authoring source,
  re-vendored, and drift-guarded. This plan only *widens the parity guard*; it does not touch the vendor-lock
  mechanism.
- **No cross-language shared module** for the parser rules (finding H) — they are not shareable; parity guards
  only.
- **Pin observable behaviour, not implementation.** Guards assert the expiry, refresh, and transient-retry
  policies that each in-scope client actually claims, plus normalized VRM and Case/PO-marker outputs on shared
  fixtures. They do not demand identical internals.
- **TKT-267 owns the packaging decision.** Current code evidence favours independently packaged runtimes with
  a shared test-only contract, but that is a recommendation, not a locked outcome. TKT-267 must consume
  PLAN-009's completed TKT-256 assessment before it affirms independence or selects a shared runtime module.
- **The authentication/retry implementations are non-uniform and per-client, not per-service.** Some service
  roots contain several distinct clients, while parser and OCR do not implement the token/retry variants that
  prompted this plan. The implementation inventory and acceptance therefore operate on concrete client
  paths, never on a one-row-per-service proxy.

## Sequence

1. TKT-267 is the decision ticket: after TKT-256 files its assessment, affirm or reverse
   `services/functions/README.md`'s "independently packaged" doctrine and record the reasoning in a new ADR.
   The recommended default remains independence plus a shared test-only behavioural contract, but the ticket
   must record how the assessment affected the decision.
2. TKT-268 implements exactly one chosen outcome. On the affirm path, a shared **test-only behavioural
   conformance harness** covers every concrete client in an explicit authentication/retry inventory. On the
   reverse path, a shared runtime module replaces the applicable duplicated implementations while preserving
   their accepted observable policies. Both paths keep per-service deployment inputs explicit.
3. TKT-269 adds cross-language behavioural parity only where independent implementations actually exist:
   Python and TypeScript VRM canonicalisation, and Python versus TypeScript Case/PO-marker recognition. EVA
   normalization is excluded because TypeScript projects already-normalized values; the existing
   schema/export guard remains the EVA contract proof.

## Gates

- **PLAN-009's TKT-256** must reach a filed, verified assessment before TKT-267 decides the packaging
  doctrine; PLAN-011 depends on PLAN-009 for that reason.
- **PLAN-007** becomes an implementation input only if TKT-267 selects the reverse path; the Python module then
  mirrors the accepted `@cs/server-runtime` boundary shape without importing TypeScript code.
- The Python packaging ADR is authored by TKT-267 at the next free ADR number; this plan does not pre-assign it.

## Close-out

The plan closes only when all members are `done`: the packaging doctrine is recorded in a new ADR; every
in-scope client is covered by the selected TKT-268 path; independently implemented VRM and Case/PO-marker
rules are parity-checked; the existing EVA schema/export guard remains green; synthetic one-sided
divergences are caught; and the Python suites plus new guards pass under `verify-all.mjs`. No member performs
a live write.

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
| [TKT-268](../backlog/TKT-268-python-token-backoff-conformance-suite/TKT-268-python-token-backoff-conformance-suite.md) | backlog | Implement the Python authentication and retry doctrine outcome |
| [TKT-269](../backlog/TKT-269-vendored-parser-cross-language-parity-guard/TKT-269-vendored-parser-cross-language-parity-guard.md) | backlog | Guard independently duplicated parser and domain rules |
<!-- /GENERATED:PROGRESS -->
