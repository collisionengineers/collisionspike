# Verification — TKT-268: Implement the Python authentication and retry doctrine outcome

## Verdict

PASS (affirm path) — 2026-07-20. Inventory + anti-drift guard (part 1) and the behavioural conformance
harness (part 2) are both delivered and verified.

## Evidence

- **A1 — decision gate.** Implements TKT-267's affirm path (ADR-0032): duplication is checked, not shared.
- **A2 — conformance harness + explicit inventory; every client exercised or N/A.**
  `auth-conformance-inventory.json` lists all 7 clients with their exact claims + 4 excluded auth callers.
  The shared `_authconf/conformance.py` probes exercise every claimed behaviour of the 6 wire-able clients;
  `ai_reasoning` is inventoried `claims: []` (retained-but-not-expiry-aware) and pinned as such
  (location-assist test). The node `check:auth-inventory` guard rescans production Python for
  token/cache/retry markers and fails on any unlisted/vanished site → PASS (70 files, 7 sites).
- **A3 — negative fixtures.** The ignore-expiry fake fails the expiry probe and the retry-a-non-transient-4xx
  fake fails the bounded-retry complement (box-webhook meta-tests); the omit-an-inventoried-client fixture
  fails the node guard's `--scan`. The location reasoner's retained bearer is represented accurately.
- **A5 — both paths.** `verify-all.mjs` invokes the node guard; each service's existing `pytest tests` run
  auto-discovers its `test_auth_conformance.py`. Observable policies are pinned, not internals.
- **A6 — no live write or deployment.**

## Commands (all green)

- Per-service `pytest tests` (base Python — httpx 0.28 / respx 0.23 / pytest 9): box-webhook **294**,
  eva-sentry **45**, vehicle-enrichment **72**, location-assist **77** — incl. the 15 new conformance tests.
- `node scripts/checks/check-auth-inventory.mjs` → PASS; `node --test scripts/checks/check-auth-inventory.test.mjs`
  → 5/5.

## How to re-verify

Run each service's `python -m pytest tests -q` and `node scripts/checks/check-auth-inventory.mjs` from a clean
checkout (Python on PATH). Flip a claimed behaviour (e.g. make a client reuse a token past expiry, or list a
non-existent claim) and confirm the harness/guard fails.
