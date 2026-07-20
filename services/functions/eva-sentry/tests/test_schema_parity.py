"""EVA payload FORMAT parity against the repo schema (TKT-277 / PLAN-012, finding C4).

`payload.validate_core_payload` imperatively re-implements the format rules in
`contracts/eva-payload.schema.json` (patterns, enums, oneOf, minLength). The existing
`test_payload_keys_match_repo_schema` covers only the key list; this guard pins the Python format
constants to the schema byte-for-byte, so a one-sided edit to either side fails the build.
"""
from __future__ import annotations

import json
from pathlib import Path

import payload as payload_mod  # function root on sys.path via conftest.py

REPO_ROOT = Path(__file__).resolve().parents[4]
SCHEMA = json.loads((REPO_ROOT / "contracts" / "eva-payload.schema.json").read_text(encoding="utf-8"))
PROPS = SCHEMA["properties"]


def test_date_patterns_match_schema():
    assert payload_mod._DATE_RE.pattern == PROPS["date_of_loss"]["pattern"]
    assert payload_mod._DATE_RE.pattern == PROPS["date_of_instruction"]["pattern"]


def test_mileage_pattern_matches_schema():
    assert payload_mod._MILEAGE_RE.pattern == PROPS["mileage"]["pattern"]


def test_vat_enum_matches_schema():
    assert list(payload_mod._VAT_ENUM) == PROPS["vat_status"]["enum"]


def test_mileage_unit_enum_matches_schema():
    assert list(payload_mod._MILEAGE_UNIT_ENUM) == PROPS["mileage_unit"]["enum"]


def test_inspection_address_oneof_matches_schema():
    one_of = PROPS["inspection_address"]["oneOf"]
    consts = [branch["const"] for branch in one_of if "const" in branch]
    patterns = [branch["pattern"] for branch in one_of if "pattern" in branch]
    # The Python validator special-cases the literal and otherwise requires the six-line pattern.
    assert "Image Based Assessment" in consts
    assert payload_mod._ADDRESS_SIX_LINES_RE.pattern in patterns


def test_required_nonempty_matches_schema_minlength():
    schema_min_length = {key for key, value in PROPS.items() if value.get("minLength") == 1}
    assert set(payload_mod._REQUIRED_NONEMPTY) == schema_min_length
