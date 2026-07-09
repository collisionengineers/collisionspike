# Operator plan excerpt — § 6 HD4110 / VRM false positives

> From `PLAN-assistant-intake-search-fixes.md` (planning session 2026-07-06). The full plan is
> preserved at
> [TKT-066 evidence](../../../verify/TKT-066-assistant-lookup-observability/evidence/operator-note.md).

Diagnostic (verified 06/07): `packages/domain/src/domain/vrm-filter.ts` — the LOOSE dateless
rule accepts `HD4110` because the ANCHOR check is document-wide (any "vehicle"/"registration"
anywhere in a letter of instruction licenses it), and the postcode-outward guard only covers
1–2 digit districts.

Plan — in `packages/domain/src/domain/vrm-filter.ts` (+ mirror the rule change into the
parser's Python sniff via the `cedocumentmapper_v2.0` sibling per ADR-0018):

- Replace the document-wide ANCHOR test with **proximity anchoring**: the loose dateless shape
  is only accepted when the anchor word appears within ~40 chars of the candidate.
- Require a *tight* anchor (immediately preceding, e.g. "reg HD4110") when the candidate's
  letter prefix is a postcode area (HD, LS, …).
- Add regression fixtures to `vrm-filter.test.ts`:
  `"***URGENT*** FW: HD4110 - LETTER OF INSTRUCTION"` → `''`; existing accepted marks unchanged.
- Data fix: SQL update clearing `candidate_vrm/vrm='HD4110'`-style junk on affected cases
  (audited), and check devnotes item 5 (networkhduk → YML) against the `work_provider` corpus
  while in there.
