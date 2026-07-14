# Verification — TKT-004: Allocate the next Case/PO number reliably

## Verdict
BLOCKED (operator)

## Evidence
Live e2e (2026-06-30, since the 10:21Z clean-slate reset): the DB-authoritative mint allocated `QDOS26001` correctly on the full happy-path case `ca3acf21`. The mint is pure DB MAX+1 over the provider sequence; the Box-aware fallback lives only in the preview route, not the mint. DB reads cross-checked against App Insights custom events.

## Pending / gaps
The production Archive fallback is part of TKT-178 and cannot be enabled from a root id alone. The
signed/checksummed job spreadsheet is absent, the production EVA API is blocked, and the exact production
Archive root plus write/retarget authority is unapproved. Test/mirror/Viewer evidence is insufficient.

## How to re-verify
Only inside TKT-178's named future window, after all global inputs, restore proof and frozen ledger approval
pass, prove fail-closed floor health, apply the exact approved ledger-derived floors and commit the exact
approved production root last. Release the predesignated journaled genuine ingress canary exactly once and confirm it
mints above the reconciled historical prefix maximum. Its database folder ID must resolve to the same exact
Archive object ID with `parent.id` equal to the approved root; do not create disposable live work.
