# Case/PO marker taxonomy: A. / AP. / D. case-types, per-marker sequences, and the dual report+audit rule

**Status:** Accepted (2026-07-03, operator decisions in-session). Extends **ADR-0014** (audit
case-type) — and **supersedes** its numbering detail (ADR-0014 implied "prepend `A.` at Case/PO
generation" onto the same number stream; the operator has since decided **separate sequences per
marker** — see Decision 2). Relates to ADR-0011 (provider identification), ADR-0018 (vendored
engine — the detection lives sibling-first).

## Context

ADR-0014 established the **audit** case-type (a second, independent CE inspection auditing a
THIRD-party engineer's original report) and its `A.` Case/PO marker, but left three things
undecided that the real corpus has since forced:

1. **The marker set is bigger than `A.`.** The corpus carries `AP.QDOS261530` / `AP.QDOS261572`
   (**total-loss audits** — the audited vehicle is written off, the deliverable includes a
   Pre-Accident Valuation) and `D.PCH26190` (**diminution** — a Diminution in Value engagement,
   a first-class CE report type per `docs/requirements/company-background.md`). EVA-side these
   ride lowercase principal codes (`a.pch`, `ap.qdos`, `d.pch`).

2. **Numbering was ambiguous.** `A.PCH261339` (seq ~1339) versus `D.PCH26190` (seq ~190) in the
   same year proves PCH's markers do **not** share one number stream. Meanwhile every observed
   QDOS audit **shares its parent case's number** (`QDOS261608/A.QDOS261608`,
   `QDOS261572/AP.QDOS261572`, `QDOS261253/A.QDOS261253`).

3. **QDOS letters are dual-deliverable and intake-indistinguishable.** All four real QDOS
   instruction letters read **"ENGINEER NOTIFICATION (REPORT + AUDIT REPORT)"** — one letter
   commissions BOTH a standard engineer's report AND an audit of the client/bodyshop report —
   and the letters are **byte-identical in wording whether the audit later resolved repairable
   (`A.`) or total-loss (`AP.`)**. Repairable-vs-total-loss emerges from the inspection, never
   the instruction.

Separately, the same corpus exposed the **"EVA (Engineers)" provider leak** (TKT-051): an audit
email's attached third-party report (EVA = Exclusive Vehicle Assessors) was being parsed as "the
instruction" (the old single-doc picker preferred PDF) and the engine's layout-name fallback then
emitted `EVA (Engineers)` as the case's *work provider*. EVA is a firm CE **audits**, never an
instructing provider.

## Decisions

1. **Taxonomy.** `case_type ∈ {standard, audit, audit_total_loss, diminution}` (choice_case_type
   100000000–100000003), markers `'' / A. / AP. / D.`. `audit_total_loss` is a **review-time
   refinement of `audit`** — it is NEVER inferred from instruction content (impossible — see
   Context 3); staff set it on the case (PATCH `caseType`) once the PAV outcome is known.

2. **Separate sequence per marker** *(supersedes ADR-0014's same-stream implication)*. Each
   (marker, principal, year) runs its own advisory-locked MAX+1 sequence: `A.PCH26001…`
   independent of `PCH26…` and of `D.PCH26…`. Implemented in `packages/domain/src/domain/
   case-po.ts` (`formatCasePo`/`casePoSequenceRegex` marker params, dot regex-escaped) and
   `api/src/lib/case-po.ts mintCasePo` (marker in the LIKE prefix, regex, SUBSTRING offset AND
   the advisory-lock key).

3. **The dual report+audit rule (QDOS pattern).** A letter whose content fires the
   `dual_report_audit_phrases` ("report + audit report") mints **ONE case from the provider's
   NORMAL sequence** with `case_type = audit`; the audit deliverable's `A.`/`AP.` ID is
   **derived from that same number at review** (marker + case_po), matching the observed
   corpus. A **standalone** audit instruction (the PCH pattern — the letter commissions only
   the audit) mints from the marker's own sequence. Decision seam:
   `packages/domain/src/domain/case-type.ts` (`decideCaseType` / `markerForMint`).

4. **Allowlist: PCH {A., D.}, QDOS {A., AP., D.} — only, for now.** Any other provider always
   mints standard; fired signals produce a warning audit_event + a review note instead of a
   marker. The allowlist is the domain constant `MARKERED_PRINCIPALS`; the migration path when
   a third provider needs markers is a `work_provider.case_type_markers` corpus column (jsonb
   or text[]), read at resolve time — deliberately NOT built until needed.

5. **Diminution is review-first.** `diminution_phrases` ("diminution in value", "diminution
   report") set the case-type signal, but **no `D.` number is minted from content alone** until
   detection is grounded on a real inbound diminution instruction (none captured yet — the
   `D.PCH26190` folder holds outputs only). The operator will supply an example; until then a
   diminution hit surfaces for review.

6. **The audited firm is never the work provider.** Three enforcement layers (TKT-051):
   the engine suppresses the layout-name `work_provider` fallback for `engineer_report: true`
   layouts (sibling `engine-v2.6`); the Data API denylists engineer-report layout names
   (`isEngineerReportLayoutSentinel`, `api/src/lib/parser-eva-fields.ts`) in BOTH the
   free-text `eva_work_provider` fill and the `work_provider_id` content match; and any live
   `EVA` work_provider row is deactivated by the D9 delta
   (`migration/assets/schema/deltas/2026-07-03-deactivate-eva-work-provider.sql`).

7. **Multi-doc parse + engineer_report evidence.** The parse activity now parses up to 3
   document attachments (Word/RTF before PDF), selects the instruction by the parser's own
   `content_typing`, and returns every parsed doc's typing; classifyPersist reclassifies
   report-typed attachments to evidence kind `engineer_report` (100000007) — ADR-0014's
   "store BOTH, never overlay", now actually wired. Guards: never strips the only
   instruction-classed row; gated by `AUDIT_CASES_ENABLED`.

8. **Shadow-then-flip rollout.** The case-type decision is computed and forwarded
   unconditionally, but APPLYING it (case_type_code write, marker mint, engineer_report kind)
   sits behind `AUDIT_CASES_ENABLED` (default off). Gate off, fired signals write observe-only
   audit_events the operator reviews before flipping (docs/gated.md §D10; the
   choice-row delta `2026-07-04-audit-case-type-taxonomy.sql` must be applied first).

## Consequences

- The classifier's `existing_provider_audit` subtype remains corroboration only; the parser's
  document-text signal is primary (ADR-0014 unchanged).
- Dedup/reply-linking accept marked refs: the parser `CASEREF_RE` takes `(AP|A|D).` prefixes;
  link-reply's exact `upper(case_po)` match needs no change.
- Box folder names carry the marker verbatim (`A.PCH26001` — legal Box name; verified no
  sanitisation in the folder-create path).
- **EVA-side export of the lowercase marker principals (`a.pch` etc.) is intake-out-of-scope**
  — the EVA drag-drop/Sentry submission layer must map `case_type` + principal → the lowercase
  EVA principal code when that phase lands (flagged for the EVA-submission work, M2).
- Open items: the operator's diminution instruction example (grounds `D.` detection); a
  standalone a.qdos inbound email if one exists; the review-time AP. refinement UX in the SPA
  (ticket TKT-057).
