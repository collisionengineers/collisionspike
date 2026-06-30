# Verification — TKT-004: Allocate the next Case/PO number reliably

## Verdict
BLOCKED (operator)

## Evidence
Live e2e (2026-06-30, since the 10:21Z clean-slate reset): the DB-authoritative mint allocated `QDOS26001` correctly on the full happy-path case `ca3acf21`. The mint is pure DB MAX+1 over the provider sequence; the Box-aware fallback lives only in the preview route, not the mint. DB reads cross-checked against App Insights custom events.

## Pending / gaps
The operator requires the allocator to read the PRODUCTION / real Box area, not the test folder (root `392761581105`). The production Box root id has not been supplied. Until then the mint cannot be made Box-authoritative.

## How to re-verify
Once the operator supplies the production Box root id, wire it into the allocator, then mint a case for a provider that already has folders in the production area and confirm the new number = latest provider folder + 1 (cross-check the minted Case/PO in Postgres + the mint custom event).
