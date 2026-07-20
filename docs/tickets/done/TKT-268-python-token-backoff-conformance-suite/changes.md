# Changes — TKT-268: Implement the Python authentication and retry doctrine outcome

## Status

**Complete** (2026-07-20). Part 1 (branch `plan011/tkt-268-auth-conformance`) delivered the checked
inventory + the node anti-drift guard; part 2 (branch `plan011/tkt-268-conformance-harness`) adds the
behavioural conformance harness that exercises every claimed behaviour of all six wire-able clients, plus
the two negative fakes. Both parts verified under base Python (httpx/respx/pytest). See "Part 2" below.

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

## Part 2 — behavioural conformance harness (complete)

- `services/functions/_authconf/conformance.py` — the shared, test-only harness. A `ClientSpec` describes one
  client (construct, primary call, respx mint/data route registration on the active router, success responses,
  auth/transient error classes, transient/non-transient statuses, max attempts, an `expire` hook, a
  backoff-neutralise hook, and an optional retry-after `capture_sleep`). Four probes assert ONLY the claimed
  behaviours: `expiry-aware-reuse` (one mint for two in-window calls, re-mint after expiry), `one-time-refresh`
  (401 → one refresh-and-retry; persistent 401 → auth error after exactly one refresh), `bounded-transient-retry`
  (a transient recovers; a persistent one stops at 1 + max-retries; **and the complement** — a non-transient 4xx
  is not retried), and `retry-after` (a `Retry-After: 1` yields a 1s sleep). `run_claimed` dispatches per claim.
- `services/functions/_authconf/fakes.py` — the two negative fakes (an expiry-blind cache; a client that retries
  a non-transient 4xx) proving the probes fail closed.
- `services/functions/{box-webhook,eva-sentry,vehicle-enrichment,location-assist}/tests/test_auth_conformance.py`
  — each parametrises over its clients' inventory rows and runs the claimed probes: box-webhook wires
  `BoxClient`/`blob_source`/`DataApiClient` + the two fake meta-tests; eva-sentry `EvaClient`; vehicle-enrichment
  `DvsaClient`/`DvlaClient`; location-assist pins `ai_reasoning` as `claims: []` (the retained-but-not-expiry-aware
  bearer) and that it ships dark.
- `tests/conftest.py` added to box-webhook/eva-sentry/vehicle-enrichment and extended in location-assist to put
  `services/functions` on `sys.path` so `_authconf` imports as a package. No `verify-all.mjs` change — each
  service already runs `pytest tests`. The node guard now excludes `_authconf` (test-only harness; its fakes
  carry markers on purpose).

Verified under base Python (httpx 0.28 / respx 0.23 / pytest 9): box-webhook 294, eva-sentry 45,
vehicle-enrichment 72, location-assist 77 — all pass, including the 15 new conformance tests; the node
`check:auth-inventory` guard still PASS.
