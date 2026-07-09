# Changes — TKT-076: real provider scoping + proximity ordering

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
`api/src/functions/inspection.ts` + `api/src/lib/mappers.ts` read `provider_code` (legacy note fallback), scope server-side, and killed the `!s.providerCode ||` firehose (unknown provider → a LABELLED global top-N). `api/src/lib/maps.ts` adds postcode extraction + Azure Maps geocode + haversine for nearest-first `distanceMiles` ordering (degrades to frequency ordering until `AZURE_MAPS_KEY` is on the api app). Pure helpers `principalFromCasePo`/`scopeSuggestions` extracted + unit-tested. Deployed to `cespk-api-dev` (82 fns).

## 2026-07-09 — scopeFallback consumed in the SPA (the verifier's FAILED line; shared with TKT-079)

`mockup-app/src/screens/CaseDetail.tsx`: fallback rows (`scopeFallback: true`, already sent by the
API) no longer render the misleading foreign "Provider XXX" chip — each shows **"Common location —
not specific to this provider"**, and a banner renders above the shortlist whenever any row is a
fallback: **"Showing common locations — none saved for this provider yet."** (plain English, no
engineering vocabulary). Deployed 2026-07-09 (SPA; 200 + CSP verified). Verifier: re-run the
providerless-case click-through — no foreign provider chips, banner present.
