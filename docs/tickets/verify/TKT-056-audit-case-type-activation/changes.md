# TKT-056 — changes made

> Design: [ADR-0021](../../../adr/0021-case-po-marker-taxonomy.md) (extends
> [ADR-0014](../../../adr/0014-audit-case-type-second-inspection.md)). Operator ladder:
> [gated.md §D9 + §D10](../../../gated.md).

## 2026-07-03 — built (code-complete, shadow-safe; NOT yet deployed; deltas NOT yet applied)

### Parser engine (sibling-first per ADR-0018 — `cedocumentmapper_v2.0` commits `6fc03cb` + `f474ea0`, tag `engine-v2.6`; re-cut into `functions/parser/cedocumentmapper_v2/`)
- `rules/engine.py` — TKT-051 guard: `engineer_report:true` layouts (EVA/CNX) never supply
  `work_provider` via the layout-name fallback; new `detect_case_type_signals` (dual > audit >
  diminution; `audit_total_loss` never content-inferred); `extract_record` populates
  `case_type`/`case_type_dual`.
- `detection/case_type.py` — full marker set (`A.`/`AP.`/`D.`) readers; `application/service.py`
  `_apply_case_type` maps all three (explicit reference marker overrides content).
- `rules/email_classifier.py` — `CASEREF_RE` prefix `(AP|A|D).`.
- `resources/triage-rules.json` + schema + loader — `dual_report_audit_phrases` (grounded on the
  4 identical real QDOS letters) + `diminution_phrases` (review-first).
- NOTE: the sibling checkout had drifted BEHIND the vendored copy (the 2026-07-02/03 classifier
  hardening was vendored-only) — reconverged by upstreaming first (`6fc03cb`), byte-mirror restored.
- `functions/parser/parser_adapter.py` — additive `case_type: {value, dual, signals, source}`
  envelope key (the `audit` key retained verbatim).

### Domain (`packages/domain`)
- NEW `src/domain/case-type.ts` — `CaseWorkType`, `CASE_PO_MARKER`, `MARKERED_PRINCIPALS`
  (PCH {audit, diminution} / QDOS {audit, audit_total_loss, diminution}), `decideCaseType`,
  `markerForMint` (dual → standard number; diminution review-first).
- `src/domain/case-po.ts` — `formatCasePo`/`casePoSequenceRegex` marker params (dot regex-escaped;
  per-marker sequence independence).
- `src/domain/classification.ts` — `EvidenceClass` + `engineer_report` (never filename-derived);
  `src/model/types.ts` `EvidenceKind` + `engineer_report`; `codecs` + `caseTypeCodec`.

### Data API (`api/`)
- `src/lib/parser-eva-fields.ts` — `isEngineerReportLayoutSentinel` denylist wired into the
  `eva_work_provider` fill AND `matchWorkProviderByContentString` (an "EVA (Engineers)" string can
  never fill either, even against a stale corpus row).
- `src/lib/case-po.ts` — marker-aware `mintCasePo` (marker in prefix/regex/offset/advisory-lock key).
- `src/functions/internal.ts` — resolve accepts `caseType`/`caseTypeDual`/`caseTypeSignals`;
  gate-on: `case_type_code` write + marker mint; gate-off: observe-only audit_event; non-allowlisted
  provider: warning audit_event + review note. Evidence route accepts kind `engineer_report`.
- `src/functions/cases.ts` — PATCH `caseType` (review-time AP./D. refinement seam; 'standard'→NULL).

### Orchestration (`orchestration/`)
- `src/functions/activities/parse.ts` — bounded multi-doc parse (`MAX_PARSE_DOCS=3`, Word-first),
  instruction selected by `content_typing` (PDF-first fallback when nothing types), per-doc
  `attachmentTypings` returned; capped candidates logged (no silent caps).
- `src/functions/activities/classifyPersist.ts` — report-typed rows → `engineer_report` evidence
  (gated; never strips the only instruction row).
- `src/functions/intakeOrchestrator.ts` — replay-safe `decideCaseType` over checkpointed results;
  forwards the decision to caseResolve; passes typings to classifyPersist.

### Schema / operator
- `deltas/2026-07-03-deactivate-eva-work-provider.sql` (D9) + `deltas/2026-07-04-audit-case-type-
  taxonomy.sql` (D10, choice rows) + canonical `000_enums_lookups.sql` updated.
- `docs/gated.md` — new §D9 + §D10 (delta first, gate flip later, shadow review in between).
