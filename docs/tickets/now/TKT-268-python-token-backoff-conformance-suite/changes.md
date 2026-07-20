# Changes — TKT-268: Implement the Python authentication and retry doctrine outcome

## Status

**In progress** (2026-07-20, branch `plan011/tkt-268-auth-conformance`). The affirm-path **inventory and
anti-drift guard** are delivered and verified; the **behavioural conformance harness** (the pytest probes
that exercise each client's claimed behaviours) is the remaining part and is deliberately deferred rather
than rushed — see "Remaining" below.

## Delivered in this change

Implements the affirm path selected by TKT-267 (ADR-0032): duplication is checked, not shared.

- `services/functions/auth-conformance-inventory.json` — the **checked per-client inventory** (single
  source of truth for both the future harness and the guard). Seven clients, each with its exact claimed
  subset of the four behaviours (expiry-aware-reuse, one-time-refresh, bounded-transient-retry,
  retry-after), plus `excluded` rows for the four deliberately-behaviourless auth callers (vision, maps,
  ocr Document-Intelligence poll, the Box credentials tool). The location reasoner is represented
  accurately as `claims: []` (a retained-but-not-expiry-aware bearer).
- `scripts/checks/check-auth-inventory.mjs` — the **anti-drift completeness guard**. It rescans production
  Python under `services/functions` for token-acquisition / cache / bounded-retry markers (comments and
  docstrings stripped so prose never trips it) and FAILS if a marker-bearing site is not accounted for in
  the inventory, if an inventory file has vanished, or if a claimed behaviour is not one of the four. It is
  wired into `verify-all.mjs` and exposed as `check:auth-inventory`.
- `scripts/checks/fixtures/auth-inventory/new-unlisted-client.fixture.py` + `check-auth-inventory.test.mjs`
  — the **omit-an-inventoried-client** negative fixture (A3): `--scan` over the fixture flags the new
  unlisted `_CachedToken`/`_RETRY_SAFE_STATUS` site; five unit tests cover the current-tree pass, the
  comment/docstring precision, `--scan`, the invalid-claim / stale-inventory paths, and the vocabulary.

## Acceptance mapping (partial)

- **A1.** Implements TKT-267's affirm path (ADR-0032). ✓
- **A2 (partial).** The explicit production-client inventory exists and the rescan for token/refresh/retry
  sites is enforced by the guard. The behavioural *exercising* of each client is the remaining harness. ◐
- **A3 (partial).** The omit-an-inventoried-client fixture fails the guard. The ignore-expiry and
  retry-a-non-transient-4xx behavioural fixtures need the conformance harness. ◐
- **A5 (partial).** `verify-all.mjs` invokes the new guard; the per-service conformance tests are the
  remainder.

## Remaining (behavioural conformance harness)

A shared, test-only `services/functions/_authconf/conformance.py` with four probes (expiry-aware-reuse,
one-time-refresh, bounded-transient-retry incl. the non-transient-4xx complement, retry-after), a
per-service `tests/test_auth_conformance.py` parametrised over the inventory (with `tests/conftest.py`
added to box-webhook/eva-sentry/vehicle-enrichment and extended in location-assist to reach the shared
module), and the ignore-expiry / retry-non-transient-4xx negative fakes. The full per-client adapter
inventory (constructors, config, mint/data URLs, error classes, clock source) is mapped in the recon
(`wf_86604394-497` journal.jsonl). Deferred deliberately: it is an intricate cross-service Python build
best done with focused attention rather than rushed, and the base Python environment (httpx/respx/pytest)
makes it fully verifiable when built.
