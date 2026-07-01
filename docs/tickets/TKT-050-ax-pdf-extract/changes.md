# Changes — TKT-050: AX PDF accident circumstances extraction too deep

## Status
now — code + offline tests complete; parser redeploy pending for live proof.

## Commits
- (uncommitted) — parsing: stop AX circumstances at Pre Existing row; harden between_labels EOF guard.

## Files touched
- `cedocumentmapper_v2.0/src/cedocumentmapper_v2/rules/engine.py` — `_extract_between_label_pair` requires end marker on line path.
- `cedocumentmapper_v2.0/providers.json` — AX `accident_circumstances` label pairs: `Pre Existing` then `Bodyshop Details` fallback.
- `cedocumentmapper_v2.0/tests/test_extraction_targeted.py` — AX with/without Pre Existing row.
- `functions/parser/cedocumentmapper_v2/rules/engine.py` — same between_labels fix (vendored).
- `functions/parser/cedocumentmapper_v2/providers.json` — same AX provider rule (deployed seed).

## Summary
AX PDF tables place a **Pre Existing / Damage** block between the circumstances narrative and
**Bodyshop Details**. The old single pair (`Circumstances || Bodyshop Details`) captured that
block. Extraction now tries `Circumstances || Pre Existing` first, falls back to Bodyshop Details
when the row is absent, and refuses to return line-captured text when the end label never appears.
