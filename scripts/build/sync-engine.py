#!/usr/bin/env python3
"""Materialize the canonical parser engine into a deployed function's package copy.

Both services/functions/parser and services/functions/ocr need a real, importable
`cedocumentmapper_v2` package at build time (Azure Functions deploys via a plain
file copy / Oryx build, not a pip install of an in-repo path) — this script is the
one place that copy is produced from the canonical source at
services/engine/cedocumentmapper_v2/, so the two deployed copies can never diverge
by hand-editing. Run it, then commit the result: materialized copies are committed,
not gitignored, matching this repo's regenerate-then-commit idiom.
scripts/checks/check-engine-materialized.py gates that they are never stale in CI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "services" / "engine" / "cedocumentmapper_v2"
ENGINE_SRC = ENGINE_ROOT / "src" / "cedocumentmapper_v2"
ENGINE_PROVIDERS = ENGINE_ROOT / "providers.json"
FINGERPRINT_NAME = "ENGINE_FINGERPRINT.json"

# Not part of a deployed function's runtime bundle: the eval/regression harness is
# test/dev tooling (its own baseline.json, comparator.py) that a Function App
# never imports.
EXCLUDED_TOP_LEVEL = {"eval"}

DEFAULT_TARGETS = (
    REPO_ROOT / "services" / "functions" / "parser" / "cedocumentmapper_v2",
    REPO_ROOT / "services" / "functions" / "ocr" / "cedocumentmapper_v2",
)


def _ignore(directory: str, names: list[str]) -> set[str]:
    ignored = {name for name in names if name == "__pycache__" or name.endswith(".pyc")}
    if Path(directory).resolve() == ENGINE_SRC:
        ignored.update(EXCLUDED_TOP_LEVEL & set(names))
    return ignored


def _normalise(data: bytes) -> bytes:
    text = data.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).encode("utf-8")


def _content_fingerprint(target: Path) -> dict[str, object]:
    """Hash every materialized file (deterministic, path-order, newline-normalised).

    Read by function_app.py's ``/fingerprint`` route as a live content-identity
    check of the deployed engine. There is no separate authoring repository/tag
    to report anymore now that the engine is authored directly in this repo, so
    unlike the old VENDOR_LOCK.json this intentionally carries no
    repository/ref/commit fields — only what's actually still meaningful
    post-merge: exactly which bytes are deployed.
    """
    paths = sorted(
        p.relative_to(target).as_posix()
        for p in target.rglob("*")
        if p.is_file() and "__pycache__" not in p.parts and p.name != FINGERPRINT_NAME
    )
    digest = hashlib.sha256()
    for rel in paths:
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(_normalise((target / rel).read_bytes()))
        digest.update(b"\0")
    return {
        "contract": "ce-engine-fingerprint-v1",
        "vendoredFileCount": len(paths),
        "contentSha256": digest.hexdigest(),
    }


def materialize(target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(ENGINE_SRC, target, ignore=_ignore)
    shutil.copy2(ENGINE_PROVIDERS, target / "providers.json")
    fingerprint = _content_fingerprint(target)
    (target / FINGERPRINT_NAME).write_text(
        json.dumps(fingerprint, indent=2) + "\n", encoding="utf-8"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target",
        type=Path,
        action="append",
        help="Materialize into this directory only (repeatable). Default: parser + ocr.",
    )
    args = parser.parse_args(argv)
    targets = [t.resolve() for t in args.target] if args.target else list(DEFAULT_TARGETS)
    for target in targets:
        materialize(target)
        try:
            label = target.relative_to(REPO_ROOT)
        except ValueError:
            label = target
        print(f"[sync-engine] materialized {label}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
