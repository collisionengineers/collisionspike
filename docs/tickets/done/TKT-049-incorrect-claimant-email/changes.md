# Changes — TKT-049: Claimant email wrongly set to AX team inbox

## Status
done — parser fix deployed + live-verified 2026-07-01.

## Commits
- (prior session) — parsing: reject AX Credit Repair team inbox from claimant-email fallback.
- Deploy: `az functionapp deployment source config-zip` → `cespike-parser-dev-x7xt3d5ovhi7y` (2026-07-01).

## Files touched
- `services/functions/parser/cedocumentmapper_v2/rules/engine.py` — `_is_non_claimant_email` guard on all `_fallback_email` paths (vendored-only B2 reconciliation).
- `services/functions/parser/tests/test_contact_extraction.py` — AX `CreditRepair_TeamInbox@ax-uk.com` stays blank.

## Summary
AX instructions carry a single provider team inbox in the header. The sole-email fallback treated
it as the claimant address. The engine now rejects team-inbox / noreply / credit-repair-context
addresses and leaves claimant email empty when no plausible claimant address exists.
