---
name: audit-case-type
description: Audit case = a 2nd independent CE inspection auditing a 3rd-party engineer's report; A.-prefix Case/PO; parser detection is LIVE but the API/orchestration/SPA layers are authored-not-applied (ADR-0014).
metadata:
  type: project
---

An **audit case** is a first-class **case-type** (orthogonal to case-status): a work provider (notably
**PCH**, who sends both regular AND audit work) instructs CE to do a **second, independent inspection**
that **audits a THIRD-PARTY engineer's original report**. Data is virtually identical to a normal
instruction (same EVA fields, same parse pipeline). Marker = an **`A.` prefix on the Case/PO**
(`A.PCH261269`); the `A.` is CE-assigned once the audit is recognised — it does not exist at live intake,
it is DERIVED from the case-type.

**NOT the engineer-report overlay.** The overlay fires only on CE's OWN `engineer_report` providers
(CNX/EVA) and MERGES values onto the instruction. An audit's original report is **third-party** (Audatex
`*.AudatexMS.pdf`, EHR `_EHR…_Report_.pdf`, etc.) and must be **stored SEPARATELY** (compared against),
never overlaid.

**State (verified 2026-06-29):**
- **Parser layer is LIVE.** `detect_audit_signals` in `functions/parser/cedocumentmapper_v2/rules/engine.py`
  matches grounded phrases (`"audit report"`, `"original engineer"`, `"original report"`, `"engineers 2"`)
  — high-precision, content-based, anchored (never bare "audit") because a false positive corrupts the
  `A.` numbering with no human gate. `ExtractedRecord` carries `is_audit` / `audit_signals`; the parser
  surfaces a NEW top-level **`audit`** envelope field — SEPARATE from the EVA payload, EVA contract
  unchanged. (Detection must be logged with its `audit_signals`.)
- **The DB shape exists:** `migration/assets/schema/050_case.sql` has `case_type_code` →
  `choice_case_type` (`standard` / `audit`), and `engineer_report` is an `evidence_kind`
  (`000_enums_lookups.sql`).
- **OPEN GAP (ADR-0014 update 2026-06-27):** `api/` + `orchestration/` do **not** yet read `is_audit`
  from the parser envelope or populate `case_type_code` — the intake doesn't set the type, store the
  original report distinctly, action-log the auto-decision, or mint the `A.` Case/PO. Layers 2–4
  (Postgres write / Data API+orchestration / SPA badge) are **authored, not applied**.

**How to apply:** when wiring audit support on the Azure stack, read the parser's `audit` envelope and
set `case_type_code`; keep the third-party original out of the engineer-report overlay path. Canonical:
**ADR-0014** (`docs/adr/0014-audit-case-type-second-inspection.md`). Relates to [[queue-case-model]],
[[sibling-projects-pointers]].
