# Live observation — 2026-07-12

- Surface: signed-in deployed SPA at `https://proud-sky-04e318b03.7.azurestaticapps.net`.
- Request: `GET https://cespk-api-dev.azurewebsites.net/api/inbound/counts`.
- Result: HTTP 500 with body `{"error":"internal"}`.
- Preflight: HTTP 204.
- Browser console: no warnings or errors during the observed reload.
- Safety: read-only network inspection; no mailbox, database or Box mutation.

## Root cause and resolved observation — 2026-07-12

- App Insights tied the two pre-fix failures to function `inboundEmailById`, not
  `inboundEmailCounts`. Their traces reported PostgreSQL `22P02` — `invalid input syntax for type
  uuid: "counts"` — proving that the parameter detail route consumed the literal path.
- The deployed detail route is now `inbound/{id:guid}` and the literal route remains
  `inbound/counts`; the Function host registers both separately.
- Post-fix Application Insights recorded repeated authenticated `inboundEmailCounts` requests as
  HTTP 200 and no new Data API 5xx, `22P02`, `inboundCountsFailed`, or exception after
  `2026-07-12T13:25:00Z`.
- Signed-in Chrome rendered `570 / 199 / 141 / 673` for Receiving work / Queries / Other / Needs
  sorting, with no console warning or failed dashboard request.
- An independent read-only PostgreSQL query under `app.role=staff` returned the same four values.
  The temporary workstation firewall rule was removed; the readback again contained only
  `AllowAzureServices`.
