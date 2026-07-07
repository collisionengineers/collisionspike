# Operator plan excerpt — § 3 Assistant: attach files/images → link to case

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../TKT-066-assistant-lookup-observability/evidence/operator-note.md).

Keep the model itself read-only (TKT-060 invariant); the write happens as an explicit,
user-confirmed SPA action:

- Drawer gains an attach button (accepts images/PDF). Attachments are held client-side and
  described to the model as context ("user attached 2 photos named …").
- The assistant identifies the target case via `lookup_case`; the SPA renders a confirmation
  card ("Add 2 files to CCPY26050?").
- On confirm the SPA calls a new authenticated endpoint `POST /api/cases/{id}/evidence/upload`
  (multipart; staff role; lands bytes in Blob `cespkevidstdev01` via the existing evidence path,
  inserts `case_evidence` + audit rows — mirrors the intake attachment landing). The model never
  performs the write.
