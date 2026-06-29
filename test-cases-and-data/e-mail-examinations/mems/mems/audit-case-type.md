---
name: audit-case-type
description: "Audit cases = a SECOND independent CE inspection auditing a THIRD-PARTY engineer's original report; marked by an `A.` Case/PO prefix; distinct from the engineer-report overlay; parser layer built 2026-06-23, rest planned (ADR-0014)"
metadata:
  node_type: memory
  type: project
  originSessionId: e3a68ae1-4438-4662-af93-32197902ca09
---

An **audit case** is a first-class **case-type** (orthogonal to case-status): a work provider (notably
**PCH**, who sends both regular AND audit work) instructs CE to do a **second, independent inspection**
that **audits a THIRD-PARTY engineer's original report**. Data is virtually identical to a normal
instruction (same 12 EVA fields, same parse pipeline). Marker = an **`A.` prefix on the Case/PO**
(`A.PCH261269`, `A.PCH261272`; nested `QDOS261253/A.QDOS261253/`). The `A.` is CE-assigned once the
audit is recognised — at live intake it does not exist yet; it is DERIVED from the case-type. Examples
in `test-cases-and-data/test-cases/` (the `A.*` dirs).

**NOT the engineer-report overlay** ([[parser-vendored-divergence]] / spike_notes_audit_issue.md): the
overlay fires only on CE's OWN `engineer_report:true` providers (CNX/EVA) and MERGES values onto the
instruction. The audit original is third-party (Audatex `*.AudatexMS.pdf`, EHR `_EHR…_Report_.pdf`,
`… report.pdf`) and must be **stored SEPARATELY** (compared against), never overlaid. At live intake an
audit case carries the **instruction + the original report**; the full/archived sample cases ALSO carry
CE's own completed audit report (e.g. `LD71OGY FINAL AUDIT.pdf`) — an OUTPUT, never present live.

**Detection = parser auto-only (user's choice), content-based, high-precision.** `detect_audit_signals`
in `rules/engine.py` matches phrases grounded in the real instructions — `"audit report"`,
`"original engineer"`, `"original report"`, `"engineers 2"` — the matching NORMAL instruction contained
NONE. Anchored to specific phrases (never bare "audit") because a false positive would corrupt the `A.`
numbering with no human gate. The decision must be **logged to the Action Log** with its `audit_signals`.

**Parser layer DONE 2026-06-23** (both vendored `functions/parser` + sibling `cedocumentmapper_v2.0`,
converged + pinned by `test_engine_vendored_in_sync` markers + PROVENANCE.md #4): `ExtractedRecord`
gained `is_audit`/`audit_signals`; `record_to_dict` serialises them; `parser_adapter` + `function_app`
surface a NEW top-level **`audit`** envelope field `{value, signals, source}` — SEPARATE from the
12-field EVA payload (like `vrm`/`reference`), EVA contract + `CONTRACT_VERSION` unchanged. 73 pytest
(vendored) / 54 (sibling). **Rest PLANNED, not built** (ADR-0014): Dataverse `cr1bd_casetype`
(standard|audit) + `engineer_report` evidence kind + `A.` Case/PO gen; intake flow sets type + stores
original report + Action-Logs the auto-decision; Code App `caseType` badge + classified original +
case-typed chaser. Relates to [[queue-case-model]], [[jobsheet-provider-rules]],
[[inspection-image-based-detection]].
