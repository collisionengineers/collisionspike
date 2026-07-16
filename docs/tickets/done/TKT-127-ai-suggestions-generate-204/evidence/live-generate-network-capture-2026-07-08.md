# Live network capture — SPA "Generate suggestions" click (2026-07-08T22:43:56Z)

Captured from the DEPLOYED SPA (`proud-sky-04e318b03.7.azurestaticapps.net`) via the chrome-devtools
MCP, operator staff session `digital@collisionengineers.co.uk` (token `roles: [CollisionSpike.Admin]`,
`aud: fa2fb28c-…`). Bearer token redacted.

## The generate POST (reqid 72)

```
POST https://cespk-api-dev.azurewebsites.net/api/cases/ac34fae6-1b6f-4af6-b296-660d53631577/ai-suggestions/generate
authorization: Bearer <redacted — staff v2 access token, aud fa2fb28c…, preferred_username digital@collisionengineers.co.uk>
origin: https://proud-sky-04e318b03.7.azurestaticapps.net
content-length: 0

→ Status: 200
→ content-type: application/json
→ access-control-allow-origin: https://proud-sky-04e318b03.7.azurestaticapps.net
→ Body: {"generated":5}
```

Followed immediately by the refetch (reqid 73):

```
GET https://cespk-api-dev.azurewebsites.net/api/cases/ac34fae6-1b6f-4af6-b296-660d53631577/ai-suggestions → 200
```

## Rendered result (a11y snapshot excerpt, same page)

The Assistant panel rendered all five suggestions with plain-language labels, confidence, rationale
and Accept/Reject buttons:

- **What happened** — 80% sure — "While reversing, the vehicle struck something, causing moderate
  damage to the rear bumper and parking sensors with scratches and dents."
- **Damage severity** — 90% sure — "Moderate"
- **Damaged area** — 95% sure — "rear"
- **Damaged area** — 95% sure — "rear offside"
- **Damaged area** — 95% sure — "rear nearside"

Screenshot: [live-generate-5-suggestions-2026-07-08.png](../evidence-manifest.json)
Postgres rows + audit: [ai-suggestion-rows-postgres-2026-07-08.txt](./ai-suggestion-rows-postgres-2026-07-08.txt)

## Note on the original "204"

The App Insights triage (see changes.md Root cause) found **zero 204s** among the API requests — the
operator's devtools "204 - no content" row was the **CORS OPTIONS preflight**, which the platform
answers before the function is reached. The real POSTs were all 200.
