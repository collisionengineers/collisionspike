#!/usr/bin/env python3
"""Cross-language parity emitter (TKT-269 / PLAN-011, widened by TKT-277 / PLAN-012).

Runs the shared parity corpus through the Python callables that mirror `@cs/domain` (and the
orchestration triage policy) and prints the results as JSON on stdout. The vitest guards
(packages/domain/src/domain/parser-parity.test.ts and
services/orchestration/src/workflows/intake/triage-parity.test.ts) spawn this, run the same corpus
through the TypeScript callables, and assert each side reproduces its pinned column and that the two
agree on every vector NOT flagged as an allowed divergence.

Import-light on purpose: it puts the parser, vehicle-enrichment, and box-webhook function roots on
sys.path and imports only the specific pure, stdlib-only callables it needs (no service venv/requirements).
It reads the corpus path from `--vectors <path>` and writes JSON only (no other prints).
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))  # scripts/checks -> scripts -> repo root
_FUNCTIONS = os.path.join(_ROOT, "services", "functions")
# Parser first so `cedocumentmapper_v2` resolves to the vendored parser; the other roots contribute
# their own uniquely-named modules (vehicle_data, evidence_kind).
for _root in (
    os.path.join(_FUNCTIONS, "parser"),
    os.path.join(_FUNCTIONS, "vehicle-enrichment"),
    os.path.join(_FUNCTIONS, "box-webhook"),
):
    if _root not in sys.path:
        sys.path.insert(0, _root)

from cedocumentmapper_v2.normalization.normalizers import normalize_vrm  # noqa: E402
from cedocumentmapper_v2.detection.case_type import case_type_for_reference  # noqa: E402
from cedocumentmapper_v2.rules.email_classifier import (  # noqa: E402
    CASEREF_RE,
    _delivered_images_only,
)
from vehicle_data.registration import canonicalize_registration  # noqa: E402
from evidence_kind import classify_evidence_kind  # noqa: E402


def _vectors_path(argv):
    if "--vectors" in argv:
        return argv[argv.index("--vectors") + 1]
    raise SystemExit("usage: parser_parity_emitter.py --vectors <corpus.json>")


def main():
    with open(_vectors_path(sys.argv[1:]), encoding="utf-8") as handle:
        corpus = json.load(handle)

    def by_name(key, fn):
        return {v["name"]: fn(v) for v in corpus.get(key, [])}

    result = {
        # TKT-269 seams (vendored parser).
        "vrm": by_name("vrmVectors", lambda v: normalize_vrm(v["input"])),
        # case_type_for_reference returns None for an unmarked/guarded reference; the corpus records
        # that as "standard" (the TS markerToCaseType default), so map it before emitting.
        "marker": by_name("markerVectors", lambda v: case_type_for_reference(v["input"]) or "standard"),
        # TKT-277 seams.
        "vrmEnrichment": by_name("vrmEnrichmentVectors", lambda v: canonicalize_registration(v["input"])),  # C2
        "evidenceKind": by_name("evidenceKindVectors", lambda v: classify_evidence_kind(v["filename"], v.get("contentType"))),  # C3
        "casePoToken": by_name("casePoTokenVectors", lambda v: "match" if CASEREF_RE.fullmatch(v["input"]) else "no-match"),  # C5
        "deliveredImagesOnly": by_name("deliveredImagesOnlyVectors", lambda v: _delivered_images_only(v.get("attachmentKinds", []), v.get("filenames", []))),  # C1
    }
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
