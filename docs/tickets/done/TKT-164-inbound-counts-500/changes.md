# Changes — TKT-164: Restore the live inbound dashboard counts

## Status
Merged in PR 62; the dashboard retry state landed in PR 61. The reviewed API and SPA artifacts were
deployed on 2026-07-12 and the route/count contract was verified against Chrome, Application Insights,
the Function inventory and an independent RLS-shaped Postgres read.

## Commit
- `1fb580a` — constrain UUID detail routes, make inbound-count failures observable, and add API regressions.

## Files touched
- `services/data-api/src/features/inbound/`
- `services/data-api/src/features/inbound/counts.test.ts`
- `services/data-api/src/features/cases/`
- `services/data-api/src/features/cases/create-archive.test.ts`
- `services/data-api/src/shared/validation/uuid.ts`

## What changed
- Constrained `GET inbound/{id}` to a GUID route so the literal `GET inbound/counts` endpoint cannot
  be consumed as an inbound-email id by the Functions host.
- Added direct-handler UUID validation before either inbound or case detail queries can reach a
  Postgres UUID column.
- Applied the same narrowly proven route-specificity fix to `GET cases/{id}` because it shares the
  identical literal-route collision risk with `GET cases/next-po`.
- Kept an empty inbox as a complete deterministic zero-count response, but changed an actual count
  query fault from false HTTP-200 zeros to a generic HTTP 500 carrying an opaque server-generated
  correlation id. Detailed failure text is logged server-side only.
- Added focused tests for route registration, role wrapping, populated/empty count contracts,
  correlated query failure, invalid ids, and the `cases/next-po` collateral route.

## Offline evidence
- API: 61 files / 585 tests passed.
- Domain source: 26 files / 551 tests passed.
- TypeScript: `tsc -b packages/domain api` passed.

## Live evidence
- Signed-in `GET /api/inbound/counts` returns 200; a missing token returns 401.
- Chrome rendered `570 / 199 / 141 / 673`, with no console error or failed dashboard request.
- A read-only Postgres query under `app.role=staff` returned the same values.
- Application Insights proved the former parameter-route/UUID collision and shows no post-release
  5xx, `22P02`, correlated count failure or API exception.
- The focused health/diagnostic procedure is recorded in `docs/operations/database.md`.
