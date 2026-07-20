# Verification — TKT-268: Implement the Python authentication and retry doctrine outcome

## Verdict

PARTIAL — 2026-07-20. The checked inventory and the anti-drift completeness guard are delivered and
verified; the behavioural conformance harness remains (ticket stays `now`).

## Evidence (delivered)

- `services/functions/auth-conformance-inventory.json` lists all 7 clients with their exact claimed
  behaviours + 4 excluded rows; `node scripts/checks/check-auth-inventory.mjs` → PASS (70 Python files
  scanned, 7 auth/retry sites, all accounted for).
- Anti-drift is real: `--scan scripts/checks/fixtures/auth-inventory` flags the unlisted
  `new-unlisted-client.fixture.py` (`unlisted-auth-site`); markers in comments/docstrings do not trip it.
- `node --test scripts/checks/*.test.mjs scripts/maintenance/*.test.mjs` → **96/96 pass** (the 5 new
  auth-inventory tests discovered and green).
- Wired into `verify-all.mjs` and exposed as `check:auth-inventory`.

## Pending / gaps (remaining harness)

- The behavioural conformance harness (`_authconf/conformance.py` probes + per-service
  `test_auth_conformance.py` + the ignore-expiry / retry-non-transient-4xx negative fakes + conftest
  wiring for 4 services) is not yet built. A2's "every client exercised for every claimed behaviour" and
  A3's two behavioural fixtures depend on it. The per-client adapter map is in the recon
  (`wf_86604394-497`), and the base Python environment (httpx 0.28 / respx 0.23 / pytest 9) verifies it.

## Commands

- `node scripts/checks/check-auth-inventory.mjs` → PASS.
- `node --test scripts/checks/check-auth-inventory.test.mjs` → 5/5 pass.

## How to re-verify

`node scripts/checks/check-auth-inventory.mjs`; add a `_CachedToken`/`_RETRY_SAFE_STATUS` site under
`services/functions/<svc>/` not listed in the inventory and confirm the guard fails.
