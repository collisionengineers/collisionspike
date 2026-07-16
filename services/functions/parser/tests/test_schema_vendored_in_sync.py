"""Guard: the package-local vendored EVA schema must stay identical to the keystone.

services/functions/parser/contracts/eva-payload.schema.json is a packaged copy that ships
inside the FC1 deployment package (the repo-root contracts/ dir is unreachable
from /home/site/wwwroot once deployed). The repo-root copy remains the single
source of truth; this test fails if the two drift apart, so a schema change in one
place is never silently lost in the deployed parser.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENDORED = HERE.parent / "contracts" / "eva-payload.schema.json"
KEYSTONE = HERE.parents[3] / "contracts" / "eva-payload.schema.json"


def test_vendored_schema_exists_and_ships() -> None:
    # Must exist (it is what the deployed Function validates against) and NOT be
    # excluded by .funcignore (contracts/ is not listed there).
    assert VENDORED.exists(), f"vendored schema missing: {VENDORED}"
    funcignore = (HERE.parent / ".funcignore").read_text(encoding="utf-8")
    assert "contracts/" not in funcignore, ".funcignore must NOT exclude contracts/"


def test_vendored_matches_repo_root_keystone() -> None:
    assert KEYSTONE.exists(), f"repo-root keystone missing: {KEYSTONE}"
    vendored = json.loads(VENDORED.read_text(encoding="utf-8"))
    keystone = json.loads(KEYSTONE.read_text(encoding="utf-8"))
    # Compare semantic content (the vendored copy carries a different description
    # noting its provenance; everything that drives validation must be identical).
    for key in ("type", "additionalProperties", "required", "propertyNames", "properties"):
        assert vendored[key] == keystone[key], f"vendored schema drifted from keystone at: {key}"
