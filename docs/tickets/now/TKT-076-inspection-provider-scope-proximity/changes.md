# Changes — TKT-076: real provider scoping + proximity ordering

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
`api/src/functions/inspection.ts` + `api/src/lib/mappers.ts` read `provider_code` (legacy note fallback), scope server-side, and killed the `!s.providerCode ||` firehose (unknown provider → a LABELLED global top-N). `api/src/lib/maps.ts` adds postcode extraction + Azure Maps geocode + haversine for nearest-first `distanceMiles` ordering (degrades to frequency ordering until `AZURE_MAPS_KEY` is on the api app). Pure helpers `principalFromCasePo`/`scopeSuggestions` extracted + unit-tested. Deployed to `cespk-api-dev` (82 fns).
