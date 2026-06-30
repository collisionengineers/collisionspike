# Changes — TKT-008: Calendar picker on the date-of-incident / instruction fields

## Status
Done — calendar/date-picker bound to both date fields; SPA build passes.

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → bound a DateField date-picker to the
  "Date of Incident" and "Date of Instruction" fields and kept the stored value EVA-compliant.

## Files touched
- `mockup-app/src/components/date-format.test.ts` (date-format unit tests).
- DateField component + the two case-page date fields (within the `94902ce` change set).

## Summary
Both EVA-contract date fields now offer a calendar picker; the selected value is normalised to the
expected EVA date format on store. Date formatting is unit-tested and the SPA build passes.
