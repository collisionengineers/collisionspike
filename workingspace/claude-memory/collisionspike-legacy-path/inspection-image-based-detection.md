---
name: inspection-image-based-detection
description: "FIXED 2026-06-21 — parser now emits canonical 'Image Based Assessment' for image-based/desktop docs (ALL providers), deployed to cespike-parser-dev + live-verified. (Was: detected the wording then BLANKED it; CS Parse only defaulted for AX.)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The cedocumentmapper_v2.0 parser DOES detect image-based/desktop wording in an instruction (e.g. an
SBL doc yields `inspection_address.raw_value = "Image-based Assessment"`), but its narrative filter
**blanks the normalised `value` to ""**: `rules/engine.py` `_address_contains_narrative`
(~lines 1054-1055) lists `"image-based assessment"` and `"desktop assessment"` among the
narrative-to-discard phrases (alongside true junk like "kind regards"). So the canonical signal is
thrown away. Downstream, live `CS Parse` (468ffd29) only re-defaults `cr1bd_evainspectionaddress` to
"Image Based Assessment" when `work_provider == 'AX'` (parse.live mapping). Net: a NON-AX provider
whose document literally says "desktop/image-based inspection" ends up with a BLANK inspection
address → the case sits in Not Ready for no good reason.

Operator confirmed (2026-06-20, reviewing an SBL case) that the **document's own wording should drive
this**, not a per-provider hardcode (consistent with their anti-hardcode philosophy).

**FIXED 2026-06-21** (document-driven, all providers): the parser engine now detects image-based /
desktop / "electronic basis" phrases and emits canonical **"Image Based Assessment"** (routed through
`normalize_address` → the required 6-line EVA form) instead of blanking. A real physical address (UK
postcode present) still WINS; genuine junk narrative is still blanked. Added 8 tests (full suite 54
passed). Deployed to the parser Function `cespike-parser-dev-x7xt3d5ovhi7y` — the fix was ported into
the VENDORED copy at `functions/parser/cedocumentmapper_v2/` (see [[parser-vendored-divergence]]) — and
live-verified (`POST /api/parse` → `inspection_address.value = "Image Based Assessment"`). The AX flow
default in CS Parse remains as a fallback. **Still TODO:** set `cr1bd_inspectiondecision = ImageBased`
(CS Parse writes only the address string, not the decision enum). Cross-ref [[queue-case-model]],
[[jobsheet-provider-rules]].
