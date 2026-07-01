# Changes — TKT-049: Claimant email wrongly set to AX team inbox

## Status
now — code + offline tests complete; parser redeploy pending for live proof.

## Commits
- (uncommitted) — parsing: reject AX Credit Repair team inbox from claimant-email fallback.

## Files touched
- `functions/parser/cedocumentmapper_v2/rules/engine.py` — `_is_non_claimant_email` guard on all `_fallback_email` paths.
- `functions/parser/tests/test_contact_extraction.py` — AX `CreditRepair_TeamInbox@ax-uk.com` stays blank.

## Summary
AX instructions carry a single provider team inbox in the header. The sole-email fallback treated
it as the claimant address. The engine now rejects team-inbox / noreply / credit-repair-context
addresses and leaves claimant email empty when no plausible claimant address exists.
