# Code audit — 2026-07-12

- `apps/web/src/shared/ui/EvaFields.tsx:99-108,142-220` commits fields on blur, dropdown and date selection.
- `apps/web/src/features/cases/CaseDetail.tsx:1023-1068` sends field PATCH requests immediately.
- `apps/web/src/features/cases/CaseDetail.tsx:1329-1367,1387-1409` starts the inspection-address PATCH and inspection-decision POST independently, does not await either before showing success, and swallows decision-write failure.
- `services/data-api/src/features/cases/` clears `inspection_decision_code` whenever the generic inspection-address field changes, so response ordering can leave the address and decision inconsistent.
- `services/data-api/src/features/cases/` already provides multi-field PATCH and stale-version rejection that the explicit save can build on.

This was a read-only source inspection; no runtime state was changed.
