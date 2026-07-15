# Changes — TKT-125: Remove the Add Case field descriptors (and the wrong "4-char" claim)

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch).

## What was built
**`apps/web/src/features/intake/ManualIntake.tsx`**:
- Removed every `hint=` descriptor under the Add Case inputs: "The vehicle's number plate.",
  "4-char principal code, e.g. KBS." (also factually wrong — codes are 2–5 chars), the Work
  provider / Case-PO ("Assigned when the case is created.") / Provider's reference / Make ("Filled
  by the vehicle lookup.") / Inspect-on hints.
- Removed the two purely-descriptive inline captions under controls: "Enter the VAT status
  manually." and "Tidy the address into a standard format." Kept: the live Case/PO-preview line
  (real data, not a descriptor) and "Inspection type: Vehicle damage inspection." (a recorded fact).
- The stale `// 4-char Principal code` code comment corrected to "(2–5 chars observed)".
- SPA-wide grep: no rendered copy anywhere claims a fixed 4-char principal (the only remaining
  "4-char" strings are none; `CASE_PO` docs already say 2–5).

## Deploy + live proof
SPA deployed; live DOM scan of the manual form: zero of the removed descriptor strings present
(`hasNumberPlateHint/has4char/hasAssigned/hasVatNote/hasTidyNote` all false). Evidence:
`evidence/live-add-case-no-descriptors.png`.

## Remainders
None.
