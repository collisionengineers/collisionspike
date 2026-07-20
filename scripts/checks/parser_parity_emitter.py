#!/usr/bin/env python3
"""Cross-language parity emitter (TKT-269 / PLAN-011).

Runs the shared parity corpus through the VENDORED PARSER's own VRM canonicaliser and Case/PO-marker
recogniser and prints the results as JSON on stdout. The Node/vitest parity guard
(packages/domain/src/domain/parser-parity.test.ts) spawns this, runs the same corpus through the
TypeScript @cs/domain callables, and asserts each side matches its pinned column (and that the two
agree on every vector NOT flagged as an allowed divergence).

Import-light on purpose: it inserts the parser function root on sys.path and imports only the two pure
stdlib-only modules (normalize_vrm, case_type_for_reference); it does not need the parser's venv or
requirements. It reads the corpus path from `--vectors <path>` and writes JSON only (no other prints).
"""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(os.path.dirname(_HERE))  # scripts/checks -> scripts -> repo root
_PARSER_ROOT = os.path.join(_ROOT, "services", "functions", "parser")
if _PARSER_ROOT not in sys.path:
    sys.path.insert(0, _PARSER_ROOT)

from cedocumentmapper_v2.normalization.normalizers import normalize_vrm  # noqa: E402
from cedocumentmapper_v2.detection.case_type import case_type_for_reference  # noqa: E402


def _vectors_path(argv):
    if "--vectors" in argv:
        return argv[argv.index("--vectors") + 1]
    raise SystemExit("usage: parser_parity_emitter.py --vectors <corpus.json>")


def main():
    with open(_vectors_path(sys.argv[1:]), encoding="utf-8") as handle:
        corpus = json.load(handle)

    vrm = {v["name"]: normalize_vrm(v["input"]) for v in corpus.get("vrmVectors", [])}
    # case_type_for_reference returns None for an unmarked/guarded reference; the corpus records that
    # in its normalised form "standard" (the TS markerToCaseType default), so map it before emitting.
    marker = {
        v["name"]: (case_type_for_reference(v["input"]) or "standard")
        for v in corpus.get("markerVectors", [])
    }
    json.dump({"vrm": vrm, "marker": marker}, sys.stdout)


if __name__ == "__main__":
    main()
