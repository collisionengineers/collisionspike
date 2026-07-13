# Verification — TKT-187: Link one provider chase to every referenced case

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — unique singular association | Exact singular fixtures prove exact provider-reference linking and the separately corroborated registration fallback, with registration-only negatives. | A signed-in real singular sample appears once on its intended operator-designated case and inbox row with the qualifying evidence recorded. | PENDING |
| A2 — one canonical email, many case links | Data-model/integration tests associate one inbound id/source hash with four case ids and prohibit cloned rows/bytes. | Signed-in multi-case sample appears on all intended real case histories; Postgres shows one inbound row and the expected links. | PENDING |
| A3 — row-safe item parsing | Parser tests cover whitespace/dashes/repeats and assert reference, registration and claimant never cross row boundaries. | Deployed detail view shows the sample’s item rows exactly paired as supplied. | PENDING |
| A4 — provider-scoped evidence hierarchy | Decision tests prove exact ref precedence, corroborated VRM fallback, supporting-only name and ambiguity on strong conflicts. | A naturally occurring/operator-designated conflict remains unresolved while unaffected items link, or this live class remains PENDING. | PENDING |
| A5 — explicit partial success | Mixed-result integration/UI tests retain every item and exact reason without rolling back valid links. | Signed-in sample shows linked and “Case not found”/ambiguous/conflict items together with correct counts. | PENDING |
| A6 — never create or reconstruct | Routing tests fail any case-create, retro or Case/PO call from a Provider chase. | Live case/Case-PO counts and audits remain unchanged after the safe singular/multi probes. | PENDING |
| A7 — correct visibility from inbox and each case | Projection/UI tests show one canonical email, case-specific item context and all-case/unresolved summaries. | Browser recording opens the inbox message and every associated real case without duplicate email cards. | PENDING |
| A8 — association-specific correction | API/UI tests remove/correct one link, preserve others and block silent unchanged reattachment after replay. | A genuine operator-approved correction survives refresh while other associations remain intact; no link is changed solely for proof. | PENDING |
| A9 — idempotent replay versus genuine later chase | Message-id, source-hash, archive and later-distinct-email tests prove correct dedup boundaries. | Safe replay leaves one source/archive object; a separate supplied chase remains a distinct email linked to overlapping cases. | PENDING |
| A10 — complete fixtures and deployed proof | All four supplied messages and every named negative/retry scenario pass parser, domain, API, orchestration and SPA suites. | Recorded signed-in proof shows the expected link count, one canonical message and zero unintended cases. | PENDING |

## Pending / gaps
Implementation and all offline and signed-in/live proof are pending.

## How to re-verify
Run the itemization/association suites and gather signed-in proof from operator-designated real chases/cases; retain unavailable live classes as PENDING and do not seed cases.
