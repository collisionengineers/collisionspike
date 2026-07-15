"""schema_validation — validate a 12-field EVA payload against the keystone schema.

The single source of truth is ``contracts/eva-payload.schema.json`` at the repo
root (authored in Slice 1). This module loads that schema once and validates the
flat ``{snake_case_key: str}`` EVA payload (NOT the per-field
``{value, confidence, source}`` extraction — caller projects values out first).

The schema is the MEMBERSHIP + FORMAT gate (exactly the 12 keys; date / enum /
address shapes). It is order-insensitive (JSON Schema ``required`` does not pin
key order); contract order is guaranteed by the producer iterating
``EVA_FIELD_ORDER`` — see parser_adapter.EVA_FIELD_ORDER.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import jsonschema
from jsonschema import Draft202012Validator


class SchemaValidationError(ValueError):
    """Raised when an EVA payload fails schema validation.

    ``issues`` is a structured list the HTTP handler surfaces verbatim:
        [{"field": <pointer|"(root)">, "code": <validator>, "message": <text>}, ...]
    """

    def __init__(self, issues: list[dict[str, str]]):
        self.issues = issues
        offending = ", ".join(sorted({i["field"] for i in issues})) or "(payload)"
        super().__init__(f"EVA payload failed schema validation: {offending}")


def _default_schema_path() -> Path:
    """Resolve contracts/eva-payload.schema.json.

    Resolution order:
      1. EVA_PAYLOAD_SCHEMA_PATH env var (app setting), if set.
      2. The PACKAGE-LOCAL vendored copy: functions/parser/contracts/. This is the
         one that ships in the FC1 deployment package (.funcignore cannot include a
         file from OUTSIDE functions/parser/, so the repo-root copy is unreachable
         once deployed to /home/site/wwwroot). Kept identical to the repo-root
         keystone by tests/test_schema_vendored_in_sync.py.
      3. The repo-root contracts/ dir, walking up from this file (local dev/tests
         run from the source tree). functions/parser/ -> repo root is parents[2].
    """
    override = os.environ.get("EVA_PAYLOAD_SCHEMA_PATH")
    if override:
        return Path(override)
    here = Path(__file__).resolve()
    packaged = here.parent / "contracts" / "eva-payload.schema.json"
    if packaged.exists():
        return packaged
    return here.parents[2] / "contracts" / "eva-payload.schema.json"


# Load + compile once at import. The schema is small and never changes at runtime.
_SCHEMA_PATH = _default_schema_path()


def _load_schema() -> dict[str, Any]:
    with open(_SCHEMA_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


try:
    _SCHEMA: dict[str, Any] | None = _load_schema()
    _VALIDATOR: Draft202012Validator | None = Draft202012Validator(_SCHEMA)
except FileNotFoundError:
    # Defer the hard failure to validate() so import never crashes the worker;
    # the handler turns this into a structured 500-class issue.
    _SCHEMA = None
    _VALIDATOR = None


def validate_eva_payload(payload: dict[str, Any]) -> None:
    """Validate ``payload`` (flat 12-field EVA object). Raise SchemaValidationError on failure.

    Collects EVERY violation (not just the first) so the caller can show staff a
    complete list of offending fields in one pass.
    """
    validator = _VALIDATOR
    if validator is None:
        raise SchemaValidationError(
            [
                {
                    "field": "(schema)",
                    "code": "schema_unavailable",
                    "message": f"EVA payload schema not found at {_SCHEMA_PATH}",
                }
            ]
        )

    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if not errors:
        return

    issues: list[dict[str, str]] = []
    for err in errors:
        issues.append(
            {
                "field": _field_pointer(err),
                "code": str(err.validator),
                "message": err.message,
            }
        )
    raise SchemaValidationError(issues)


def _field_pointer(err: jsonschema.exceptions.ValidationError) -> str:
    """Best-effort field name for a validation error.

    Prefers the offending property name (the last path element, or the property
    named in additionalProperties/required messages); falls back to "(root)".
    """
    path = list(err.absolute_path)
    if path:
        return str(path[-1])
    # required / additionalProperties / propertyNames errors carry the property
    # in validator_value or the message; surface what we can.
    if err.validator in ("required", "additionalProperties", "propertyNames"):
        # err.message e.g. "'mileage' is a required property"
        return err.message
    return "(root)"
