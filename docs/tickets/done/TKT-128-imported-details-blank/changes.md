# Changes — TKT-128: "Imported details" renders blank

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch). Root cause on BOTH sides recorded below.

## Root cause
1. **Render side**: the panel mapped `c.overviewFacts.*` filtered to truthy and rendered NOTHING
   when every fact was absent — a silent blank under the "From the instruction document or email."
   caption.
2. **Data side**: the ov_* overview columns are written by exactly ONE live path — manual intake
   (`insuredName` → ov_insured_name, `providerReference` → ov_claim_number). The email-intake
   parser path NEVER writes ov_*: the parser envelope (`ParserEvaFields`) carries only the
   9 parser-owned EVA fields + vrm + reference — there are no insured/third-party/policy/insurer/
   repairer facts to drop; nothing was being "lost in the seam". So every parsed case's panel was
   legitimately empty in ov_* terms (its imported values live in the EVA fields on the Fields tab,
   with "From instructions" provenance) — but the panel neither said so nor showed the one fact the
   parser DOES carry.

## What was built
- **Render** (`apps/web/src/features/cases/CaseDetail.tsx`): explicit plain-English empty state —
  **"Nothing was imported from the instruction document or email yet."** — whenever no fact is
  present.
- **Data** (`services/data-api/src/features/` `applyParserFields`): the parser's provider reference
  (`parserRef`) now ALSO fills **ov_claim_number** (fill-if-empty, capped at the column's
  varchar(100)) — the same column manual intake's "Provider's reference / Claim No" writes — so a
  parsed case's panel shows its Claim no. instead of nothing. Tests added in
  `services/data-api/src/features/inbound/internal/parser-fields.test.ts` (fills both columns; never clobbers an existing
  value; no-op without a ref).

## Deploy + live proof
api + SPA deployed. Empty state verified live on two cases (an image-only case and a parsed QDOS
case whose ov_* are pre-fix empty). The ov_claim_number fill takes effect for the NEXT parsed
email intake (fill-if-empty; no backfill of prior rows was attempted).

## Remainders
- prior parsed cases keep an empty panel (now honestly labelled). If the operator wants the
  panel populated for the wider fact set (insured/insurer/repairer/policy), that needs the PARSER
  to extract those facts (sibling cedocumentmapper_v2.0 change + envelope + ov_* mapping) — suggest
  a new ticket; out of scope here.
- Verifier: confirm on the first real parsed intake after 2026-07-09 that Claim no. appears.

## 2026-07-09 — scoped follow-up (PLAN-003 intake wave): subject-sniffed ref now seeds the panel too

The first fix covered only the PARSER's reference (`applyParserFields` fill-if-empty). A
subject-only ref (no parsable document — e.g. the QDOS "46533/1 - …" shape, whose cases carried
empty `case_ref`/panel) still rendered the empty state. The case-CREATE seam
(`services/data-api/src/features/` `internalCasesResolve`) now writes the subject-sniffed
`candidateRef` into **`ov_claim_number`** (capped at varchar(100)) alongside `case_ref` at INSERT
time, so the Imported-details panel shows a Claim no. for subject-only refs as well;
`applyParserFields` keeps its own fill-if-empty for the parser ref (never clobbers).
Covered by the wave's api build + tests (335 pass); deployed 2026-07-09 (api 89 fns).
Verifier: a subject-only-ref intake after 2026-07-09 should show its Claim no. in the panel.
