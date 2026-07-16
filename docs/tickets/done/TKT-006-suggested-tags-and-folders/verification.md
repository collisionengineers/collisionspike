# Verification — TKT-006: Suggest email categories/tags + Outlook folders, log overrides

## Verdict
VERIFIED-LIVE (tag/suggestion half)

## Evidence
On live intake, `inbound_email` rows are populated (not NULL) with suggested codes:
- case `dc307411` (partial): `suggested_subtype_code = 100000002` ("New Client Work").
- case `ca3acf21` = `QDOS26001` (full): `suggested_category_code = 100000000` ("Receiving Work").
Both observed on real inbound rows from the live mailbox set (see live registry
[live-environment.md](../../../operations/live-environment.md) for current intake/subscription state).

## Pending / gaps
The "+ sort into Outlook sub-folders" half (Instructions / Queries / Images / bespoke) is deferred to
Phase 2 — not built. The override-log feedback surface tracks with TKT-015.

## How to re-verify
Read `suggested_category_code` / `suggested_subtype_code` on a fresh `inbound_email` row after a new
email lands; confirm they are non-NULL and map to the expected code-table labels.
