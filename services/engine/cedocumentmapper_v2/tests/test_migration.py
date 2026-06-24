import json
from pathlib import Path
from jsonschema.validators import Draft202012Validator  # type: ignore
from referencing import Registry, Resource  # type: ignore
from cedocumentmapper_v2.config import (
    migrate_providers_config,
    migrate_providers_config_with_report,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
V1_PROVIDERS_PATH = REPO_ROOT / "providers.json"
V2_SCHEMA_PATH = REPO_ROOT / "docs" / "contracts" / "provider-config.schema.json"


def test_migration_and_validation():
    assert V1_PROVIDERS_PATH.exists()
    assert V2_SCHEMA_PATH.exists()

    with open(V1_PROVIDERS_PATH, "r", encoding="utf-8") as f:
        v1_data = json.load(f)

    # Perform migration
    v2_data = migrate_providers_config(v1_data)

    # Check structure
    assert v2_data["schema_version"] == 2
    assert len(v2_data["providers"]) > 0

    # Ensure each has expected attributes
    first = v2_data["providers"][0]
    assert "id" in first
    assert "name" in first
    assert "work_provider" in first
    assert "detect" in first
    assert "field_rules" in first

    # Validate against v2 JSON schema without making network calls
    with open(V2_SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)

    # Load referenced schema
    ref_schema_path = V2_SCHEMA_PATH.parent / "extraction-rule.schema.json"
    with open(ref_schema_path, "r", encoding="utf-8") as f:
        ref_schema = json.load(f)

    # Construct modern Registry resources
    schema_resource = Resource.from_contents(schema)
    ref_resource = Resource.from_contents(ref_schema)

    registry = Registry().with_resources([
        ("https://collisionengineers.local/contracts/provider-config.schema.json", schema_resource),
        ("https://collisionengineers.local/contracts/extraction-rule.schema.json", ref_resource),
    ])

    # Validate
    validator = Draft202012Validator(schema, registry=registry)
    validator.validate(v2_data)


def test_migration_report_shape_and_unknown_preservation():
    v1_data = {
        "providers": [
            {
                "name": "Acme Co",
                "detect_phrases": ["Acme"],
                "field_rules": {
                    "vrm": {"method": "single_label", "config": "Reg"},
                    # Unknown v1 method -> must be migrated best-effort but
                    # preserve the original method, never silently dropped.
                    "vehicle_model": {"method": "magic_lookup", "config": "Model"},
                    # Unknown field key -> must be preserved in metadata.
                    "totally_made_up_field": {"method": "single_label", "config": "X"},
                },
                # Unknown provider field -> preserved under metadata.v1_unknown.
                "some_legacy_flag": True,
            }
        ]
    }

    v2_data, report = migrate_providers_config_with_report(v1_data)

    # Backward-compatible: the plain function returns the same v2 doc.
    assert migrate_providers_config(v1_data) == v2_data

    # Report shape
    assert report["schema_version"] == 2
    assert report["totals"]["providers"] == 1
    assert report["totals"]["fields_migrated"] >= 2
    assert report["totals"]["unknown_field_rules"] == 1
    assert report["totals"]["unknown_rule_kinds"] == 1

    prov_report = report["providers"][0]
    assert prov_report["id"] == "acme_co"
    assert "vrm" in prov_report["fields_migrated"]
    assert prov_report["unknown_field_rules"] == ["totally_made_up_field"]
    assert prov_report["unknown_rule_kinds"] == [
        {"field": "vehicle_model", "v1_method": "magic_lookup"}
    ]
    assert "some_legacy_flag" in prov_report["unknown_provider_fields"]
    assert any(d["field"] == "work_provider" for d in prov_report["defaults_applied"])

    # Preserved-as-unknown round-trips in provider metadata.
    prov = v2_data["providers"][0]
    meta = prov["metadata"]
    assert meta["v1_unknown"]["some_legacy_flag"] is True
    assert "totally_made_up_field" in meta["v1_unknown_field_rules"]
    assert meta["v1_unknown_rule_kinds"]["vehicle_model"] == "magic_lookup"

    # Unknown rule kind is migrated best-effort and keeps the original method.
    assert prov["field_rules"]["vehicle_model"]["kind"] == "label_same_line"
    assert prov["field_rules"]["vehicle_model"]["v1_method"] == "magic_lookup"
