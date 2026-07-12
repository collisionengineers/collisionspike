# Changes — TKT-164: Restore the live inbound dashboard counts

## Status
API implementation is complete offline on `codex/tkt-164-inbound-route`; the dashboard retry state
landed in PR 61. The dispatching loop moved this ticket from `backlog` to `now`; deployment and live
verification remain pending.

## Commit
- `1fb580a` — constrain UUID detail routes, make inbound-count failures observable, and add API regressions.

## Files touched
- `api/src/functions/inbound.ts`
- `api/src/functions/inbound-counts.test.ts`
- `api/src/functions/cases.ts`
- `api/src/functions/cases-create-box.test.ts`
- `api/src/lib/uuid.ts`

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

## Still required
- Integrate the dashboard's retryable partial-error state from TKT-155.
- Deploy the API and SPA through the normal validated deployment path.
- Prove authenticated 200 counts, independent live-source parity, 401/403 behavior, correlation
  telemetry on a controlled failure path, and clean Chrome network/console behavior before moving
  the ticket through verification.
