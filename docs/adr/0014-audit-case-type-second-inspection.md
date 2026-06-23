# Audit cases are a first-class case-type: a second, independent inspection auditing a third-party engineer's original report

**Status:** Accepted (2026-06-23). Parser layer **implemented**; Dataverse / flow / Code App layers
**planned** (this ADR is the spec for them). Relates to ADR-0011 (work-provider roles), ADR-0004
(parser-as-Function), and the `cedocumentmapper_v2.0/spike_notes_audit_issue.md` §7.

## Context

A work provider — notably **PCH**, from whom Collision Engineers takes both regular *and* audit work —
sometimes instructs CE to perform a **second, independent inspection** whose purpose is to **audit an
original engineer's report** produced by **someone else** (a third party). The instruction and its data
are *virtually identical* to a normal instruction: the case is parsed for the same 12 EVA fields by the
same pipeline. "Audit" is therefore a **case-type**, orthogonal to case-status — **not** a different
parse path and **not** an EVA field.

Two things make it distinct:

1. **Marker — `A.` on the Case/PO.** Audit cases are numbered with a leading `A.` to separate them from
   the provider's regular work: `A.PCH261269`, `A.PCH261272` (vs a standard `PCH26…`). Worked examples
   live in `test-cases-and-data/test-cases/A.PCH261269`, `…/A.PCH261272`, plus a nested audit sub-folder
   `QDOS261253/A.QDOS261253/`. The `A.` is CE-assigned **once the audit is recognised** — at live intake
   it does not yet exist; it is *derived from* the case-type, not the source of it.

2. **Documents — store BOTH, never overlay.** At live intake an audit case carries two things that must
   both be extracted and stored: (a) the **instruction** (e.g. `Inspection Request - Audit Report.DOC`,
   `Enclosing Inspection Request to Engineers 2 ….msg`), parsed as normal; and (b) the **original
   engineer's report** being audited — a **third-party** document (`*.AudatexMS.pdf`,
   `_EHR…_Report_.pdf`, `… report.pdf`), stored as its own classified attachment so the CE engineer can
   **compare** against it.

This is **NOT** the engineer-report **overlay** (`spike_notes_audit_issue.md` §§2–3). The overlay fires
only for CE's **own** `engineer_report:true` providers (CNX/EVA) and **merges** a second doc's values
onto the instruction. The audit original is third-party and must be kept **separate** (you are *auditing*
it, not enriching from it), so the overlay must **not** run on it.

> The full/archived sample cases also contain CE's **own completed audit report** (e.g.
> `…/A.QDOS261253/LD71OGY FINAL AUDIT.pdf`). That is an **output**, produced later — **not** present at
> live intake and never assumed by intake logic.

A 2026-06-23 recon confirmed nothing in the spike recognised any of this — no `A.` handling, no
case-type, no original-report classification, no flow/Code App concept.

## Decision

1. **Case-type is a first-class, orthogonal attribute** (`standard | audit`), independent of
   case-status. Every existing case is `standard`; nothing about the EVA 12-field contract changes
   (audit is internal). The whole existing parse pipeline is reused — the data is "virtually identical".

2. **Detection is automatic, content-based, in the parser** (no human confirm gate — chosen
   deliberately). The engine emits an `is_audit` signal from the **instruction text** (`audit_signals`
   lists the phrases that fired). Markers are **grounded in the real PCH audit instructions** —
   `"audit report"`, `"original engineer"`, `"original report"`, `"engineers 2"` — and the matching
   *normal* instruction in the same corpus contained **none** of them. The detector is **high-precision
   on purpose**: a false positive would mis-mark a standard case as an audit and corrupt its Case/PO
   numbering, so it anchors to specific phrases, never the bare word "audit".
   - **Risk accepted (no human gate):** a mis-classification flips the `A.` numbering with no review
     step. Mitigations: (a) precision-biased markers; (b) the decision is **logged to the Action Log**
     with its `audit_signals` so it is observable; (c) the markers are validated against real extracted
     instruction bodies as a Gate item (see Consequences). Detection can be revisited toward
     "hint + confirm" later without reshaping the data model.

3. **The original engineer's report is stored, not parsed** (chosen scope). It is classified as a new
   evidence kind `engineer_report` and linked to the case so the CE engineer opens and compares against
   it. Field-extracting the original (for an in-app side-by-side) is explicitly a **later** enhancement
   (third-party formats — Audatex/EHR/bodyshop — vary widely).

4. **`A.` numbering is derived from the case-type**, applied at Case/PO generation when
   `casetype = audit`.

## Implementation — layered (parser DONE; rest PLANNED)

### Layer 1 — Parser ✅ implemented 2026-06-23 (this ADR's only built layer)
- `rules/engine.py` — `_AUDIT_PHRASES` + pure `detect_audit_signals(text) -> (is_audit, signals)`
  (sibling of the existing `_is_image_based_inspection` content classifier); `extract_record` sets it.
- `domain/models.py` — `ExtractedRecord.is_audit: bool` + `audit_signals: tuple[str, ...]`.
- `application/service.py` — `record_to_dict` serialises `is_audit` / `audit_signals`.
- Authored **identically in both** the vendored (`functions/parser`) and sibling
  (`cedocumentmapper_v2.0`) copies; pinned by `test_engine_vendored_in_sync` markers + `PROVENANCE.md`
  (converged feature #4).
- `functions/parser/parser_adapter.py` + `function_app.py` — surface a new top-level **`audit`**
  envelope field `{ value: bool, signals: [...], source }`, **separate** from the 12-field EVA payload
  (exactly like `vrm`/`reference`). `CONTRACT_VERSION` unchanged (the EVA contract is untouched).
- Tests: `test_audit_detection.py` (5) + 2 envelope tests in `test_parse.py`. Suite **73 passed**
  (vendored) / **54 passed** (sibling).

### Layer 2 — Dataverse (planned)
- `cr1bd_cases`: add `cr1bd_casetype` (Choice `standard|audit`, default `standard`).
- `cr1bd_evidencekind`: add option `engineer_report` (the original third-party report) — distinct from
  `instruction` / `valuation`.
- Case/PO generation: prepend `A.` when `casetype = audit`.
- Optional `AUDIT_CASES_ENABLED` env-var gate (default off) to ship dormant, per the spike's convention.
- Doc updates: `docs/architecture/data-model.md`, `docs/requirements/intake-workflow.md`.

### Layer 3 — Flows (planned)
- Intake: set `cr1bd_casetype` from the parser's `audit.value`; write an Action-Log entry recording the
  auto-decision + `audit.signals`; store the original report as an `engineer_report` Evidence row.
- Case/PO action: prepend `A.` when audit.

### Layer 4 — Code App (planned)
- `caseType` on `Case`; an "Audit" badge; Case/PO shows the `A.`; the original report surfaced as its
  own classified document; readiness notes the original report is attached; a **case-typed chaser** for
  the original report if missing (reuses the case-typed chaser mechanism shipped 2026-06-23).

### Layer 5 — Validation Gate (planned)
- Validate the marker set against **real extracted instruction bodies** (the recon used NUL-stripped
  raw bytes of `.DOC`/`.msg`; confirm once the readers run end-to-end), and confirm zero false positives
  across the standard-case corpus.

## Consequences

- **Positive:** one orthogonal attribute + one evidence kind models the whole feature; no parallel parse
  path; the EVA contract is untouched; audit decisions are observable via the Action Log; the parser
  layer ships now with zero live-schema risk.
- **Negative / watch:** auto-only detection has no human gate (risk + mitigations above); the original
  report is stored but not field-extracted (comparison is manual for now); the Dataverse/flow/Code App
  layers are authored-not-applied until approved.

## Out of scope
- Field-extracting the original engineer's report for an in-app side-by-side comparison.
- Any change to the 12-field EVA contract (audit is internal; EVA submission remains CE's fresh
  assessment).
- Reconciling CE's own completed audit report at intake (it is a later output, never an intake input).
