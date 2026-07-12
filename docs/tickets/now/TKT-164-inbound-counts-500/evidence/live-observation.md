# Live observation — 2026-07-12

- Surface: signed-in deployed SPA at `https://proud-sky-04e318b03.7.azurestaticapps.net`.
- Request: `GET https://cespk-api-dev.azurewebsites.net/api/inbound/counts`.
- Result: HTTP 500 with body `{"error":"internal"}`.
- Preflight: HTTP 204.
- Browser console: no warnings or errors during the observed reload.
- Safety: read-only network inspection; no mailbox, database or Box mutation.
