# Changes — TKT-006: Suggest email categories/tags + Outlook folders, log overrides

## Status
Done (tag/suggestion half live; the Outlook-folder-sort half is deferred to Phase 2).

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → added the suggested-category/subtype surface and persistence on inbound email, so each row carries a deterministic tag suggestion.

## Files touched
- Orchestration intake path + Data API inbound-email surface (within the `94902ce` change set).
- `inbound_email` columns `suggested_category_code` / `suggested_subtype_code`.

## Summary
The deterministic inbound classifier now persists a suggested category and subtype on every inbound
email row, giving staff a suggestion surface instead of an empty field. Suggestions are observations
only — nothing is auto-applied. The "+ sort into Outlook sub-folders" half of the ticket is deliberately
deferred to Phase 2 and was not built here.
