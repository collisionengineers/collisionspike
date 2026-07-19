# Distillation note — TKT-269

**Source:** `workingspace/architecture-simplification/05-python-doctrine-and-parity.md` ticket 3 (finding H).
**Plan:** PLAN-011. Re-verified by direct inspection of the committed paths on 2026-07-19.

**Overlap (two sources of truth):**
- VRM canonicalisation — Python `cedocumentmapper_v2/normalization/normalizers.py::normalize_vrm` vs TS
  `packages/domain/src/domain/vrm-canon.ts::canonicalizeVrm`. **Not identical** — Python keeps an extra-digit
  special-case regex the TS "single source of truth" lacks.
- Case/PO-marker recognition — Python
  `cedocumentmapper_v2/detection/case_type.py::{marker_for_reference,case_type_for_reference}` vs TypeScript
  `packages/domain/src/domain/retro-case.ts::{parseCasePoMarker,markerToCaseType}`.

**Existing guards (do NOT check cross-language parity):**
- `parser/tests/test_engine_vendored_in_sync.py` — SHA-256/AST pin of the engine vs its **authoring repo**
  (`VENDOR_LOCK.json`).
- `parser/tests/test_schema_vendored_in_sync.py` — EVA schema vs `contracts/`.

**Not independent counterparts:** `packages/domain/src/domain/case-type.ts::decideCaseType` consumes the
parser's `parserCaseType` result, and `packages/domain/src/contracts/eva-export.ts::buildEvaPayload` emits
already-normalized values. Neither can prove parity with Python detection/normalization.

**Gap PLAN-011 fills:** a cross-language behavioural guard for VRM and Case/PO-marker recognition only,
pinning outputs on shared fixtures and catching a one-sided change in either seam. The existing EVA-schema
guard and ADR-0018 vendor-lock mechanism remain untouched.
