# Code audit — 2026-07-12

- `mockup-app/src/components/EvaFields.tsx:99-108,142-220` commits fields on blur, dropdown and date selection.
- `mockup-app/src/screens/CaseDetail.tsx:1023-1068` sends field PATCH requests immediately.
- `mockup-app/src/screens/CaseDetail.tsx:1329-1367,1387-1409` starts the inspection-address PATCH and inspection-decision POST independently, does not await either before showing success, and swallows decision-write failure.
- `api/src/functions/cases.ts:391-410` clears `inspection_decision_code` whenever the generic inspection-address field changes, so response ordering can leave the address and decision inconsistent.
- `api/src/functions/cases.ts:323-468` already provides multi-field PATCH and stale-version rejection that the explicit save can build on.

This was a read-only source inspection; no runtime state was changed.
