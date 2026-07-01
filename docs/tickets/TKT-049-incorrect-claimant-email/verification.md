# Verification — TKT-049: Claimant email wrongly set to AX team inbox

## Verdict
TESTED (offline)

## Evidence
- `functions/parser` venv: `pytest tests/test_contact_extraction.py::test_ax_credit_repair_team_inbox_is_not_claimant_email` → **1 passed**
- Existing contact-extraction tests unchanged (explicit claimant label + sole-email positive cases).

## Pending / gaps
- Parser Function redeploy required for live intake.
- Live case re-check after redeploy: `eva_claimant_email` should be NULL/blank on AX instructions with only the team inbox.

## How to re-verify
1. Redeploy `cespike-parser-dev`.
2. Parse an AX instruction PDF/email that only contains `CreditRepair_TeamInbox@ax-uk.com`.
3. Confirm `claimant_email` / `eva_claimant_email` is empty (not the team inbox).
