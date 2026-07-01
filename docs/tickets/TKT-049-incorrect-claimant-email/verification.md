# Verification — TKT-049: Claimant email wrongly set to AX team inbox

## Verdict
VERIFIED-LIVE (2026-07-01)

## Evidence
- Offline: `pytest tests/test_contact_extraction.py::test_ax_credit_repair_team_inbox_is_not_claimant_email` → **1 passed**; drift guard **6/6**.
- Deploy: `cespike-parser-dev-x7xt3d5ovhi7y` — 3 functions registered post config-zip (`parse`, `classify_email`, `extract_images`).
- Live: `POST /api/parse` on [TKT-050 sample AX intake .eml](../TKT-050-ax-pdf-extract/evidence/New%20inspection%20request%20-%20AX%20Ref1074398.eml) with `provider_hint=ax` → `claimant_email.value=""` (not `CreditRepair_TeamInbox@ax-uk.com`).

## Pending / gaps
None.

## How to re-verify
1. `POST /api/parse` on an AX instruction that only contains `CreditRepair_TeamInbox@ax-uk.com`.
2. Confirm `extraction.claimant_email.value` is empty.
