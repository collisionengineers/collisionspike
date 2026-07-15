# Changes — TKT-147: Tractable layout: capture vehicle make (two-label rule) + a VIN field slot

## Status
now — engine work sibling-first code-complete (engine-v2.14, pushed), re-vendored into the parser
Function copy; NO deploy this ticket (per the dispatch brief) — the re-vendored Function rides the
NEXT parser deploy (live /parse stays engine-v2.13 until then).

## Commits
- SIBLING `cedocumentmapper_v2.0` @ `2609b1a` (branch `feat/tkt043-open-case-ref-context`, annotated
  tag **`engine-v2.14`**, branch + tag PUSHED to origin) — `feat(engine): two_label_join rule kind +
  vin envelope field slot (collisionspike TKT-147)`: the new rule kind, the vin envelope field,
  normalize_vin, EVA_EXPORT_FIELD_ORDER decoupling, migration mapping, schema enums, Tractable seed
  rules, fixtures + 12 new tests, eval-baseline regeneration.
- THIS repo (feat/backlog-drain, this commit) — re-cut of the vendored engine core from
  `engine-v2.14` per the PROVENANCE.md procedure INCLUDING the deliberate providers.json seed update;
  PROVENANCE.md history/pin entry (also trues up the stale "engine-v2.13 commit+tag PENDING" note —
  v2.13 was subsequently committed as sibling `05494a9` + tag pushed);
  `services/functions/parser/tests/test_eva_export.py` updated to the EVA_EXPORT_FIELD_ORDER contract
  (+ VIN-cannot-leak assertion); ticket artifacts.

## Files touched
Sibling (authoring source of truth — commit `2609b1a`):
- `src/cedocumentmapper_v2/domain/models.py` — `FieldKey.VIN` (optional, envelope-only), FIELD_ORDER
  + FIELD_LABELS, NEW `EVA_EXPORT_FIELD_ORDER` (= the settled EVA key set, excludes vin)
- `src/cedocumentmapper_v2/rules/engine.py` — `two_label_join` dispatch + `_extract_two_label_join`
  (parts via the existing label_same_or_next_line machinery; placeholder-dash part = absent; min
  confidence; first part's span) + VIN normalize hook in `extract_record`
- `src/cedocumentmapper_v2/normalization/normalizers.py` + `__init__.py` — `normalize_vin`
  (uppercase, strip whitespace, placeholder tokens `-`/`N/A`/… → empty)
- `src/cedocumentmapper_v2/exporters/eva_json.py` — iterates EVA_EXPORT_FIELD_ORDER (EVA export
  byte-stable; `eva-json.schema.json` UNTOUCHED, additionalProperties:false still enforced)
- `src/cedocumentmapper_v2/config/migration.py` — v1 method `two_label_join`
  (config `First||Second`, comma alternates per side) → the new kind; distinct from v1 `two_labels`
  (→ between_labels)
- The sibling's documentation and runtime extraction-rule schema copies — kind enum plus
  `first_labels`/`second_labels`/`separator`; the documentation copy also picked up the
  `label_pairs` block that had existed only in the runtime copy.
- The sibling's documentation and runtime provider-configuration schema copies —
  `suppress_fallback_fields` enum gains `vin`.
- `providers.json` (seed) — Tractable: `vehicle_model` → `two_label_join` `Producer||Model`; NEW
  `vin` ← single_label `VIN`; `vin` fallback-suppressed
- Sibling fixtures: `TRACTABLE_01.expected.json` re-pinned (vehicle_model
  `Volkswagen Touran`, vin `WVGZZZ1TZFW030347`); new `TRACTABLE 02.pdf`
  (= TKT-102 evidence `tractable2.pdf`) plus `TRACTABLE_02.expected.json` — THE NO-VIN SAMPLE (vin ""
  from the `-` placeholder; absence is not an error)
- Tests: `tests/test_rules.py` (5 two_label_join + 3 vin), `tests/test_normalization.py`
  (normalize_vin), `tests/test_migration.py` (2 mapping), `tests/test_exporters.py`
  (EVA_EXPORT_FIELD_ORDER + a VIN-never-exports pin)
- `src/cedocumentmapper_v2/eval/baseline.json` — deliberately regenerated (isolated seeded engine)

This repo:
- `services/functions/parser/cedocumentmapper_v2/` — re-cut @ `engine-v2.14`: `domain/models.py`,
  `rules/engine.py`, `config/migration.py`, `exporters/eva_json.py`,
  `normalization/normalizers.py`, `normalization/__init__.py`, `providers.json` (deliberate seed
  update); all other shared files byte-identical
- `services/functions/parser/cedocumentmapper_v2/PROVENANCE.md` — v2.14 history entry + Source pin
- `services/functions/parser/tests/test_eva_export.py` — EVA_EXPORT_FIELD_ORDER contract + VIN-leak pin
- Ticket folder: this file, `verification.md` (verdict stays PENDING; re-verify steps),
  `evidence/fixture-extractions.txt`

## Summary
The Tractable damage-capture PDF labels make ("Producer") and model ("Model") as two separate
label/value pairs whose rows the two-column layout interleaves with Repair Summary rows — no
existing rule kind could join them (TKT-102's recorded remainder), and the engine had no VIN slot.
A new `two_label_join` rule kind captures each part independently and joins them
("Volkswagen Touran" / "Hyundai i30" / "Toyota Auris" on the three real samples), and a new
OPTIONAL, envelope-only `FieldKey.VIN` extracts where a layout labels it (present on TRACTABLE 01;
the `-` placeholder on the no-VIN samples normalizes to empty — absence is not an error; NO
document-wide fallback sniff). The EVA export is untouched: `EVA_EXPORT_FIELD_ORDER` pins the
settled contract key set and a test proves a VIN-carrying record still exports without a VIN key.
On the cloud path the Function adapter reads `record_to_dict(...).fields.vin` and surfaces it as
the top-level `/parse` `vin` field cell; orchestration and the SPA parser adapter preserve it
outside the settled 12-key EVA extraction.

Suite results — sibling: 439 passed / 4 skipped (baseline) → **451 passed / 4 skipped** (+12 new,
zero regressions); eval baseline all-upward (overall 0.9483→0.9571, new vin 1.0, work_provider
0.75→0.7778, vehicle_model stays 1.0); mypy/ruff pre-existing findings unchanged (35/27), none in
the additions. Vendored copy: **1 failed / 281 passed / 11 skipped BOTH before and after the re-cut**
(the failure is the recorded pre-existing environmental `test_multiformat_extraction[ALS_doc]` on
this Windows box; drift guard green).

Notable during implementation: regenerating the eval baseline via the CLI default
(`python -m cedocumentmapper_v2.eval.ci_eval --update-baseline`) scores against the user's
PERSISTED desktop catalog, which is stale for CHANGED providers (seed-merge only adds missing ones)
— the harness tests caught the resulting wrong baseline, and it was regenerated the isolated way
(`run_eval(app_data_dir=<tmp>, seed_path=<repo seed>)`). Recorded as a follow-up candidate, not
fixed here (out of scope).

## Regression follow-up

- [2026-07-11 expose VIN through the Function contract](./changes-regression-11-07-26.md)
