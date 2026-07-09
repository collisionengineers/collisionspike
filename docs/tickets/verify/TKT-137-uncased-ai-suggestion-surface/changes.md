# Changes — TKT-137: Surface triage_category AI suggestions on uncased emails — currently written but invisible

## Status
code-complete offline (final wave D2, 2026-07-09) — SPA deploy + live verification PENDING

## Changes — TKT-137

**SPA only (`mockup-app/src`); the server seam was already complete (producer + audited review/apply), it was purely unrendered.**

- `screens/inbox-suggestions.ts` — added the triage_category selector family alongside the
  Phase-2 ref-gate helpers: `TRIAGE_CATEGORY_SUGGESTION_TYPE`, `triageCategoryValue`
  (defensive jsonb narrower — never throws), `pendingTriageCategorySuggestion` (pending rows
  of that type; no target case required, but a row proposing nothing degrades to "no banner"),
  `triageCategoryLabel`/`triageCategoryHeadline` (plain handler English composed from the
  E-mail-type display maps — subtype label preferred; unknown tokens humanised, never the raw
  enum token), and `appliedEmailType` (the taxonomy-validated pair an accept applies —
  mirrors the server promote guard).
- `screens/Inbox.tsx` — the email-preview panel renders an info MessageBar for an UNCASED row
  with a pending triage_category suggestion: "The assistant thinks this is “X”." + the
  server-authored rationale, with Accept / Ignore mapping to the existing audited seam
  `POST /api/ai-suggestions/{id}/review` (useReviewAiSuggestion). Accept patches the sidebar
  row's category/subtype in place only when the server reported `promoted: true` (it never
  overwrites a human's classification — that path gets an honest "the type a person chose
  stays" toast) and refreshes the grid either way; Ignore dismisses with a neutral toast.
  Failures surface via the existing error-toast idiom. New panel prop `onEmailTypeChanged`.
- `screens/inbox-suggestions.test.ts` — 12 new pure-logic tests (selector filtering, headline
  composition incl. unknown-token humanisation, malformed-value tolerance, applied-pair
  validation). Suite: 24 files / 353 tests green; `npm run build` green.

**Producer shape consumed** (read-only confirmation): `api/src/functions/internal.ts`
L1929-1940 writes `suggested_value = { category, subtype, sourceMessageId? }` (tokens
validated at write time); `rationale` is the ai_suggestion column, not part of the value.
Accept-side apply: `api/src/functions/ai-suggestions.ts` L272-353 (relabel unless
classifier_mode='human', improvement signal + inbound_reclassified audit).

**Semantics kept:** suggest-only (nothing changes until a person clicks), no engineering
language rendered, uncased rows only (a linked row's type is anchored to its case; staff use
Reclassify there).

**Not yet verified live:** needs a real pending triage_category suggestion on the deployed
stack (acceptance line 3).

## Batch note
The same SPA change-set carries the TKT-072 addendum (search case-row age + email deep-link
`/inbox?item=<id>`, honored by a one-shot Inbox effect via the new pure `inbox-deep-link.ts`
helpers) — recorded in TKT-072's changes.md; it rides the same SPA deploy.
