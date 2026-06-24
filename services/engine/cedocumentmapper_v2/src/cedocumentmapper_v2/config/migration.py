from __future__ import annotations

import re
from typing import Any
from cedocumentmapper_v2.domain.models import FieldKey


# v1 rule methods that have a direct v2 translation. Anything outside this set is
# treated as an unknown rule kind: it is still migrated best-effort, but the
# original method is preserved in provider metadata so it round-trips and is
# surfaced in the migration report (per AGENTS.md Migration Rule).
KNOWN_V1_METHODS: frozenset[str] = frozenset(
    {
        "single_label",
        "labels",
        "multiline_labels",
        "two_labels",
        "fixed_position",
        "fixed_position_label",
        "single_label_offset",
        "email_date",
        "manual_input",
        "fixed_value",
        "acsp_claim_form",
    }
)


def clean_label_token(val: str) -> str:
    return val.replace("\r", "").replace("\n", "").strip()


def split_tokens(config_val: str) -> list[str]:
    if not config_val:
        return []
    return [clean_label_token(t) for t in config_val.split(",") if clean_label_token(t)]


def parse_two_label_config(config_value: str) -> tuple[str, str]:
    raw = (config_value or "").strip()
    if "||" in raw:
        start, end = raw.split("||", 1)
        return start.strip(), end.strip()
    parts = [part.strip() for part in raw.splitlines() if part.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return "", ""


def _new_provider_report(safe_id: str, name: str) -> dict[str, Any]:
    return {
        "id": safe_id,
        "name": name,
        "fields_migrated": [],
        "defaults_applied": [],
        "unknown_field_rules": [],
        "unknown_rule_kinds": [],
        "unknown_provider_fields": [],
    }


def migrate_provider(
    v1_prov: dict[str, Any], report: dict[str, Any] | None = None
) -> dict[str, Any]:
    name = v1_prov.get("name", "Unknown")

    # Generate safe ID
    safe_id = re.sub(r"[^a-z0-9_-]+", "", name.lower().replace(" ", "_"))
    if not safe_id or not safe_id[0].isalnum():
        safe_id = "p_" + safe_id if safe_id else "provider"

    prov_report = _new_provider_report(safe_id, name)

    v1_rules = v1_prov.get("field_rules", {})

    # Retrieve work_provider from rules
    wp_rule = v1_rules.get("work_provider", {})
    work_provider = wp_rule.get("config", "").strip()
    if not work_provider:
        work_provider = name
        prov_report["defaults_applied"].append(
            {"field": "work_provider", "reason": "fell back to provider name"}
        )

    # Detect phrases
    detect_phrases = v1_prov.get("detect_phrases", [])
    detect = {
        "required_phrases": [str(p).strip() for p in detect_phrases if str(p).strip()],
        "optional_phrases": [],
        "negative_phrases": [],
        "minimum_confidence": 0.75,
    }
    if not isinstance(v1_prov.get("detect"), dict):
        prov_report["defaults_applied"].append(
            {"field": "detect.minimum_confidence", "value": 0.75}
        )

    # Unknown v1 field-rule kinds are not dropped: their raw v1 definition is
    # carried into provider metadata so it round-trips, and the original method
    # name is recorded for the migration report.
    unknown_field_rules: dict[str, Any] = {}
    unknown_rule_kinds: dict[str, str] = {}

    # Field rules migration
    field_rules = {}
    for key_str, v1_rule in v1_rules.items():
        try:
            field_key = FieldKey(key_str)
        except ValueError:
            # Unknown field key: do NOT drop it. Preserve the raw v1 rule in
            # metadata so it round-trips, and record it in the report.
            unknown_field_rules[key_str] = v1_rule
            prov_report["unknown_field_rules"].append(key_str)
            continue

        method = v1_rule.get("method", "single_label")
        config = v1_rule.get("config", "")

        # Translate rule kinds
        kind = "label_same_line"
        rule_data: dict[str, Any] = {"id": f"{safe_id}_{key_str}"}

        if method == "acsp_claim_form":
            kind = "acsp_claim_form"
        # Handle presence checks for vat_status & mileage_unit
        elif field_key in {FieldKey.VAT_STATUS, FieldKey.MILEAGE_UNIT}:
            kind = "presence"
            rule_data["tokens"] = split_tokens(config)
            if field_key == FieldKey.VAT_STATUS:
                rule_data["value"] = "Yes"
                rule_data["absent_value"] = "No"
            else:
                # If Km/km is mentioned in config, default unit to Km, else Miles
                rule_data["value"] = "Km" if "km" in config.lower() else "Miles"
                rule_data["absent_value"] = "Miles" if rule_data["value"] == "Km" else "Km"
        else:
            if method in {"single_label", "labels", "multiline_labels"}:
                kind = "label_same_or_next_line" if method == "single_label" else "label_same_line"
                rule_data["labels"] = split_tokens(config)
            elif method == "two_labels":
                kind = "between_labels"
                start, end = parse_two_label_config(config)
                rule_data["start_label"] = start
                rule_data["end_label"] = end
            elif method == "fixed_position":
                kind = "fixed_line"
                raw_pos = config.strip()
                range_match = re.match(r"^(\d+)\s*-\s*(\d+)", raw_pos)
                if range_match:
                    rule_data["line_start"] = int(range_match.group(1))
                    rule_data["line_end"] = int(range_match.group(2))
                else:
                    try:
                        match = re.match(r"^(\d+)", raw_pos)
                        rule_data["line_number"] = int(match.group(1)) if match else 1
                    except Exception:
                        rule_data["line_number"] = 1
            elif method == "fixed_position_label":
                kind = "fixed_line_label"
                line_part, label = parse_two_label_config(config)
                try:
                    rule_data["line_number"] = int(line_part)
                except Exception:
                    rule_data["line_number"] = 1
                rule_data["labels"] = [label] if label else []
            elif method == "single_label_offset":
                kind = "line_offset"
                label, offset_part = parse_two_label_config(config)
                rule_data["labels"] = [label] if label else []
                # Parse offset
                m = re.fullmatch(r"\s*([+\-])\s*(\d+)\s*", offset_part)
                if m:
                    sign = m.group(1)
                    magnitude = int(m.group(2))
                    rule_data["offset"] = magnitude if sign == "+" else -magnitude
                else:
                    rule_data["offset"] = 0
            elif method == "email_date":
                kind = "email_date"
                rule_data["labels"] = [config.strip()] if config.strip() else []
            elif method in {"manual_input", "fixed_value"}:
                kind = "manual"
                rule_data["value"] = config.strip()
            else:
                # Unknown rule kind: migrate best-effort to a label rule, but
                # preserve the original v1 method so it round-trips and record it
                # in the report. Never silently discard it.
                kind = "label_same_line"
                rule_data["labels"] = split_tokens(config)
                rule_data["v1_method"] = method
                unknown_rule_kinds[key_str] = method
                prov_report["unknown_rule_kinds"].append(
                    {"field": key_str, "v1_method": method}
                )

        rule_data["kind"] = kind
        field_rules[key_str] = rule_data
        prov_report["fields_migrated"].append(key_str)

    # Build migrated provider
    migrated = {
        "id": safe_id,
        "name": name,
        "work_provider": work_provider,
        "enabled": True,
        "priority": int(v1_prov.get("priority", 0) or 0),
        "detect": detect,
        "field_rules": field_rules,
    }
    if isinstance(v1_prov.get("detect"), dict):
        migrated["detect"] = v1_prov["detect"]

    # Preserve v1 provider fields as user data. Known booleans stay at root for
    # compatibility, and any unknown keys are kept under metadata.v1_unknown.
    for opt in ["engineer_report", "use_current_date_for_inspection_date", "force_postcode_for_inspection_address", "suppress_fallback_fields"]:
        if opt in v1_prov:
            migrated[opt] = v1_prov[opt]

    known_keys = {
        "name",
        "priority",
        "field_rules",
        "detect",
        "detect_phrases",
        "engineer_report",
        "use_current_date_for_inspection_date",
        "force_postcode_for_inspection_address",
        "suppress_fallback_fields",
    }
    unknown = {k: v for k, v in v1_prov.items() if k not in known_keys}

    # Assemble provider metadata so preserved-as-unknown data round-trips.
    metadata: dict[str, Any] = {}
    if unknown:
        metadata["v1_unknown"] = unknown
        prov_report["unknown_provider_fields"] = sorted(unknown.keys())
    if unknown_field_rules:
        metadata["v1_unknown_field_rules"] = unknown_field_rules
    if unknown_rule_kinds:
        metadata["v1_unknown_rule_kinds"] = unknown_rule_kinds
    if metadata:
        migrated["metadata"] = metadata

    if report is not None:
        report["providers"].append(prov_report)
        report["totals"]["providers"] += 1
        report["totals"]["fields_migrated"] += len(prov_report["fields_migrated"])
        report["totals"]["unknown_field_rules"] += len(prov_report["unknown_field_rules"])
        report["totals"]["unknown_rule_kinds"] += len(prov_report["unknown_rule_kinds"])
        report["totals"]["defaults_applied"] += len(prov_report["defaults_applied"])

    return migrated


def _new_report() -> dict[str, Any]:
    return {
        "schema_version": 2,
        "providers": [],
        "totals": {
            "providers": 0,
            "fields_migrated": 0,
            "unknown_field_rules": 0,
            "unknown_rule_kinds": 0,
            "defaults_applied": 0,
        },
    }


def migrate_providers_config(v1_data: dict[str, Any]) -> dict[str, Any]:
    """Migrate a v1 provider catalog to v2.

    Returns the v2 catalog dict (backward-compatible shape). Use
    :func:`migrate_providers_config_with_report` to also obtain a structured
    migration report describing defaults applied and preserved-as-unknown data.
    """
    v2_data, _report = migrate_providers_config_with_report(v1_data)
    return v2_data


def migrate_providers_config_with_report(
    v1_data: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Migrate a v1 provider catalog to v2 and return ``(v2_data, report)``.

    ``v2_data`` is identical to the value returned by
    :func:`migrate_providers_config` (so it still validates against the v2
    provider-config schema). ``report`` is a structured, JSON-serializable
    summary of the migration with this shape::

        {
          "schema_version": 2,
          "providers": [
            {
              "id": str,
              "name": str,
              "fields_migrated": [field_key, ...],
              "defaults_applied": [{"field": str, ...}, ...],
              "unknown_field_rules": [field_key, ...],
              "unknown_rule_kinds": [{"field": str, "v1_method": str}, ...],
              "unknown_provider_fields": [key, ...]
            },
            ...
          ],
          "totals": {
            "providers": int,
            "fields_migrated": int,
            "unknown_field_rules": int,
            "unknown_rule_kinds": int,
            "defaults_applied": int
          }
        }

    Unknown v1 field-rule kinds and unknown provider fields are never dropped:
    they are carried into each provider's ``metadata`` so they round-trip, and
    are itemized in this report.
    """
    report = _new_report()
    v2_providers = []
    for prov in v1_data.get("providers", []):
        v2_providers.append(migrate_provider(prov, report))

    v2_data = {
        "schema_version": 2,
        "providers": v2_providers,
    }
    return v2_data, report
