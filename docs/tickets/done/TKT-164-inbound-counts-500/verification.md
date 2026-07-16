# Verification — TKT-164: Restore the live inbound dashboard counts

## Verdict

VERIFIED-LIVE — all acceptance criteria satisfied on 2026-07-12.

## Evidence by acceptance criterion

1. **Root cause — VERIFIED-LIVE.** App Requests recorded the failing literal URL under function
   `inboundEmailById`; correlated traces reported PostgreSQL `22P02`, `invalid input syntax for type
   uuid: "counts"`. This proves the unconstrained parameter route consumed the literal endpoint.
2. **Contract/auth — VERIFIED-LIVE.** Post-release signed-in requests repeatedly returned 200 under
   `inboundEmailCounts`; a direct missing-token probe returned 401.
3. **Empty/RLS behavior — TESTED + VERIFIED-LIVE.** API tests pin populated and empty contracts. Live
   settings use non-owner `cespk_app` with `PGAPPROLE=staff`; an independent read under the same policy
   shape returned the production counts.
4. **Regression coverage — TESTED.** Focused inbound/case-route tests passed 19/19, covering role and
   route registration, populated/zero/query-failure behavior, invalid ids, and the collateral
   `cases/next-po` literal-route guard. The release API suite passed 585 tests.
5. **Dashboard behavior — VERIFIED-LIVE + TESTED.** Chrome rendered the returned counts. Tests pin the
   section-only retry state and prohibit a failed read being presented as zero.
6. **Failure observability — TESTED.** Tests pin the opaque correlation response/header and detailed
   server-only `inboundCountsFailed` event; technical detail is not rendered to staff.
7. **Chrome/source parity — VERIFIED-LIVE.** Chrome and DevTools showed `/api/inbound/counts` 200,
   values `570 / 199 / 141 / 673`, no failed dashboard request, and no console warning/error. The
   independent `app.role=staff` query returned the same values. After the read, only
   `AllowAzureServices` remained in the server firewall.
8. **Runbook — TESTED.** `docs/operations/database.md#inbound-dashboard-count-health-probe` records the
   protected probe, parity query, RLS/firewall rules, KQL and exact route-collision signature; the
   Azure router links it. Documentation validation passed.

## Post-release telemetry

- Five observed signed-in `inboundEmailCounts` requests returned 200 after deployment.
- Focused queries after `2026-07-12T13:25:00Z` returned zero Data API 5xx requests, zero
  `inboundCountsFailed`/`22P02` traces and zero Data API exceptions.
- Function inventory: 108 registrations, with `inbound/{id:guid}` and `inbound/counts` separate.

Verified by: independent ticket-verifier dispatch; evidence transcribed by the orchestrating loop,
2026-07-12.
