# Distillation note — TKT-269

**Source:** `05-python-doctrine-and-parity.md` ticket 3 (finding H). **Plan:** PLAN-011. Re-verified read-only
2026-07-19 (`PLAN-011.dossier.json`).

**Overlap (two sources of truth):**
- VRM canonicalisation — Python `cedocumentmapper_v2/normalization/normalizers.py::normalize_vrm` vs TS
  `packages/domain/src/domain/vrm-canon.ts::canonicalizeVrm`. **Not identical** — Python keeps an extra-digit
  special-case regex the TS "single source of truth" lacks.
- Case-type markers — Python `detection/case_type.py` (`AP.`/`A.`/`D.`) vs TS `case-type.ts` (`CASE_PO_MARKER`,
  `LEADING_MARKER_RE`), both citing ADR-0021/0014.
- EVA field rules — Python `exporters/eva_json.py` + `normalizers.py::validate_fields` vs the `contracts/` EVA
  schema.

**Existing guards (do NOT check cross-language parity):**
- `parser/tests/test_engine_vendored_in_sync.py` — SHA-256/AST pin of the engine vs its **authoring repo**
  (`VENDOR_LOCK.json`).
- `parser/tests/test_schema_vendored_in_sync.py` — EVA schema vs `contracts/`.

**Gap PLAN-011 fills:** a cross-language **behavioural** parity guard (vendored parser rules vs `@cs/domain`),
pinning normalized outputs on a fixture corpus — catches the VRM special-case divergence. Vendor-lock
mechanism (ADR-0018) untouched. This is PLAN-011's terminal anti-drift guard; PLAN-012 generalises it.
