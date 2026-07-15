"""Resolve catalogued repository evidence by SHA-256 or logical source path."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MANIFEST = REPOSITORY_ROOT / "tests" / "fixtures" / "manifests" / "evidence.json"


@lru_cache(maxsize=4)
def load_evidence_manifest(manifest_path: Path = DEFAULT_MANIFEST) -> dict:
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def resolve_evidence(
    *,
    sha256: str | None = None,
    original_path: str | None = None,
    manifest_path: Path = DEFAULT_MANIFEST,
    require_file: bool = True,
) -> Path:
    """Return the content-addressed path for one catalogued evidence usage."""

    manifest = load_evidence_manifest(manifest_path.resolve())
    selected_sha = (sha256 or "").lower()
    normalised_path = (original_path or "").replace("\\", "/").removeprefix("./")
    if not selected_sha and normalised_path:
        usage = next(
            (item for item in manifest["usages"] if item["originalPath"] == normalised_path),
            None,
        )
        selected_sha = usage["sha256"] if usage else ""
    if not selected_sha:
        raise FileNotFoundError(f"Evidence usage is not catalogued: {normalised_path or '(empty selector)'}")

    blob = next((item for item in manifest["blobs"] if item["sha256"] == selected_sha), None)
    if blob is None:
        raise FileNotFoundError(f"Evidence blob is not catalogued: {selected_sha}")
    resolved = (REPOSITORY_ROOT / blob["storagePath"]).resolve()
    if not resolved.is_relative_to(REPOSITORY_ROOT):
        raise ValueError(f"Evidence storage path escapes the repository: {blob['storagePath']}")
    if require_file and not resolved.is_file():
        raise FileNotFoundError(f"Evidence blob is missing: {blob['storagePath']}")
    return resolved
