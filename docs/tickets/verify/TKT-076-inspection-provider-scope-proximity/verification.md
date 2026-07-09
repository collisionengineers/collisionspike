# Verification — TKT-076: Inspection suggestions ignore the provider and distance — real scoping + nearest-first

## Verdict
DEPLOYED + DATA-PROVEN (2026-07-06). Scoping is live and proven at the data layer; proximity ordering
is deployed but degrades to frequency ordering until `AZURE_MAPS_KEY` is wired on the api app (the one
follow-up). Live SPA click-through per provider is the operator's (API HTTP is bearer-gated).

## Offline tests (api vitest — 183 pass)
- `api/src/lib/inspection-scope.test.ts`: `principalFromCasePo` marker parse (`A.PCH…`→PCH); `scopeSuggestions`
  returns only provider rows, is case-insensitive, and does NOT keep no-provider rows (the old
  `!s.providerCode ||` firehose); labelled fallback when no provider matches / empty provider;
  `sortSuggestions({byDistance})` orders nearest-first with no-distance rows last; `rowToSuggestedAddress`
  prefers the `provider_code` column over the legacy `source_note` token.
- `api/src/lib/maps.test.ts`: `extractPostcode` (full UK only), `haversineMiles` (Manchester→London ~160mi).

## Live data probe (deployed api + reseeded corpus; Postgres, SET ROLE csadmin)
Per-provider scoping matrix:
| provider | sites | geocoded | #1 (what a case sees) |
|---|---|---|---|
| QDOS | 1 | 1 | Asher Road, ML6 8TA |
| PCH | 1 | 0 | 87 Countess Road |
| QCL | 132 | 127 | Cariocca Business Park, M12 4AH (freq 412) |
| FW | 97 | 89 | Somstar Recovery and Storage, B5 6JX (freq 168) |

- **QDOS + PCH are now present** (absent under the old parse) — a QDOS case scopes to its 1 QDOS site.
- **Firehose closed**: `SELECT count(*) … suggested … provider_code IS NULL` = **0** — no case can see the
  unlabelled whole corpus any more.
- Every suggested row carries `provider=<CODE>` in `source_note` + a `provider_code` column.

## Pending
- `AZURE_MAPS_KEY` on `cespk-api-dev` for live runtime proximity (`distanceMiles`); corpus lat/lon are
  already present (1878 rows) so ordering activates the moment the key lands. Degrades honestly today.
- Operator live SPA click-through per provider (API HTTP audience-token blocked for the agent, AADSTS65001).

Full narrative: `LIVE_FACTS.json` `verifiedBy` (2026-07-06 inspection-address repair).

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

FAILED on one acceptance line; 4 of 6 live-proven. PASS live: provider scoping (QDOS 1 row ML6 8TA / PCH 1 row / FW 8-of-8 own rows freq-ordered 168-first / QCL corpus row confirmed), capped mixed-provider fallback at the wire (8 rows all scopeFallback:true — never the firehose), clean degradation to frequency order (no case postcode extractable in 80 scanned), nothing auto-confirms. FAILED: the fallback is never LABELLED in the SPA — scopeFallback has zero consumers in mockup-app/src, and fallback rows actively mislead with foreign "Provider XXX" chips. distanceMiles unobserved live (no postcode-bearing case; expected-absence branch). Side observation for the loop: the live v2 token carries roles ["CollisionSpike.Admin"] while the registry narrative says the role was renamed Superuser 2026-06-27 — registry/roles look queued. DISPOSITION: reopened verify->now; the scopeFallback banner/chip fix (shared with TKT-079) goes to the UI-fixup dispatch.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
