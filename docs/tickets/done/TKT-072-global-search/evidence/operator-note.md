# Operator plan excerpt — § 7 Global search + same-VRM display

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../../verify/TKT-066-assistant-lookup-observability/evidence/operator-note.md).

Diagnostic (verified 06/07): `mockup-app/src/components/AppShell.tsx` line 438–444 — the
SearchBox only `navigate('/')` on Enter. No search endpoint exists; `openVrmTwins`
(`GET /api/cases?vrm=`) already returns all open same-VRM cases.

Plan:

- New endpoint `GET /api/search?q=` (staff role) in a new `api/src/functions/search.ts`: one
  normalized query across `case_` (Case/PO, VRM space-insensitive, ref, claimant),
  `inbound_email` (subject, sender), `work_provider` (name/code). Returns
  `{ cases[], emails[], providers[] }` capped per group.
- SPA: wire the AppShell SearchBox to a results view (`/search?q=`) listing all matches — every
  case sharing the searched VRM is listed with provider/status/age so "3 same VRM" shows all
  three; case rows link to case detail, email rows to the inbox item.
- Reuse the twin logic for a "N other cases share this registration" grouping header.
