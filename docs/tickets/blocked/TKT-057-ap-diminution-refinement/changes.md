# Changes — TKT-057: AP. total-loss review flow (SPA half ONLY)

## Status
The **AP./case-type control half is built + live** (2026-07-09, PLAN-003 UI wave). The **D.
(diminution) detection half is NOT touched** — it stays blocked on the operator's real inbound
diminution instruction email (see the ticket's "Blocked on").

## What was built

**Domain — `packages/domain/src/domain/case-type.ts`**: new pure `derivedMarkerCasePo(caseType,
casePo)` — the review-time derived audit ID: marker + Case/PO for a markered type on an UNMARKED
number (the QDOS dual pattern, e.g. PCH26010 → AP.PCH26010); a Case/PO already carrying a marker is
returned unchanged (a standalone A. mint IS the marker ID — never double-prefixed, and never a
renumber: presentation-only, the stored case_po is untouched). Unit tests added in
`case-type.test.ts`. `Case.caseType?` surfaced on the domain Case
(`packages/domain/src/model/types.ts`) + `services/data-api/src/shared/mapping/` (`case_type_code` → name,
omitted for standard).

**SPA — `apps/web/src/features/cases/CaseDetail.tsx`**: a compact case-type control in the title-tag
row — a menu button labelled with the current type in plain English (**"Standard case" / "Audit
review" / "Total-loss audit review" / "Diminution review"**) with radio items; persists via the
EXISTING `PATCH /api/cases/{id} { caseType }` seam and folds the server Case back (an omitted
caseType correctly CLEARS to standard). Shown only when the provider is marker-allowlisted
(PCH/QDOS via `allowedCaseTypes`) or the case already carries a non-standard type — it never
clutters ordinary cases. When the derived marker ID differs from the stored Case/PO it renders as
a mono badge beside the control (tooltip: "use this number on the EVA-side audit submission").

## Deploy + live proof
SPA deployed (the PATCH seam pre-existed). Live E2E on `A.QDOS26035`
(`/case/2e4497d7-809e-46de-ba92-6f7e1f4dd9e6`): control showed "Audit review" → set **"Total-loss
audit review"** → toast + persisted across a hard reload → reverted to "Audit review" (live data
left as found). Evidence: `evidence/live-case-type-menu-open.png`,
`evidence/live-case-type-set-total-loss.png`.

## Remainders / deferred
- **D. detection grounding** — untouched (data-gated on the operator's d.qdos sample).
- The derived-ID badge only shows for a markered TYPE on an UNMARKED number; whether an
  already-A.-minted case refined to total-loss should RENUMBER (A.→AP.) is an open ADR-0021
  question deliberately not answered here (the control records the type; the number stands).
- EVA-export/Box surfacing of the derived ID at submit time (the ticket's "not yet surfaced/used at
  EVA-export/Box time") remains follow-up work gated with TKT-056's activation ladder.
