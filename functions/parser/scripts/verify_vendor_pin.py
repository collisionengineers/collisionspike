#!/usr/bin/env python3
"""Verify the deployed parser engine against its immutable sibling-repo pin.

The check has two layers:

* Always: hash the complete vendored engine boundary and compare it with
  ``cedocumentmapper_v2/VENDOR_LOCK.json``.  This is dependency-free and runs in
  CollisionSpike CI even though the private sibling repository is unavailable.
* When the sibling clone is present: resolve the locked tag/commit with Git,
  enumerate the source boundary in both directions, and compare every source
  blob plus ``providers.json`` directly with the locked commit.  The sibling's
  currently checked-out branch is deliberately irrelevant.

Use ``--write --ref engine-vX.Y`` only after re-vendoring from a committed,
pushed tag.  The command refuses to write a lock unless the vendored files match
that tag exactly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


PARSER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PARSER_ROOT.parents[1]
VENDOR_ROOT = PARSER_ROOT / "cedocumentmapper_v2"
LOCK_PATH = VENDOR_ROOT / "VENDOR_LOCK.json"
PROVENANCE_PATH = VENDOR_ROOT / "PROVENANCE.md"
DEFAULT_SIBLING = REPO_ROOT.parent / "cedocumentmapper_v2.0"

EXPECTED_REPOSITORY = "collisionengineers/cedocumentmapper_v2.0"
EXPECTED_SOURCE_ROOT = "src/cedocumentmapper_v2"
EXPECTED_OMITTED_FILES = {
    "__main__.py",
    "cli.py",
    "ui/host.py",
    "resources/extraction-rule.schema.json",
    "resources/provider-config.schema.json",
}
EXPECTED_OMITTED_PREFIXES = {"eval/", "extraction/"}


class PinError(RuntimeError):
    """The checked-in vendor tree or its immutable source pin is invalid."""


def _normalise(data: bytes) -> bytes:
    """Match the historical drift guard while remaining cross-platform."""

    text = data.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).encode("utf-8")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def _vendored_paths() -> list[str]:
    # Enumerate the complete deployed package boundary, not a suffix allow-list.
    # A future non-Python runtime resource must therefore be either re-vendored
    # and pinned or explicitly reviewed as an omission; it cannot disappear just
    # because the old guard only knew about ``*.py`` / ``resources/*.json``.
    paths: set[str] = set()
    for path in VENDOR_ROOT.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        rel = path.relative_to(VENDOR_ROOT).as_posix()
        if rel in {"PROVENANCE.md", "VENDOR_LOCK.json"}:
            continue
        paths.add(rel)
    return sorted(paths)


def _aggregate(entries: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    for path in sorted(entries):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(_normalise(entries[path]))
        digest.update(b"\0")
    return digest.hexdigest().upper()


def _worktree_entries() -> dict[str, bytes]:
    return {path: (VENDOR_ROOT / path).read_bytes() for path in _vendored_paths()}


def _git(sibling: Path, *args: str, text: bool = True) -> str | bytes:
    proc = subprocess.run(
        ["git", "-C", str(sibling), *args],
        check=False,
        capture_output=True,
        text=text,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.strip() if text else proc.stderr.decode(errors="replace").strip()
        raise PinError(f"git {' '.join(args)} failed: {stderr}")
    return proc.stdout


def _origin_repository(sibling: Path) -> str:
    """Return ``owner/repo`` for the clone's origin, across HTTPS/SSH forms."""

    remote = str(_git(sibling, "remote", "get-url", "origin")).strip()
    lowered = remote.lower().rstrip("/")
    if lowered.endswith(".git"):
        lowered = lowered[:-4]
    if lowered.startswith("git@github.com:"):
        return lowered.split(":", 1)[1]
    marker = "github.com/"
    if marker in lowered:
        return lowered.split(marker, 1)[1]
    raise PinError(f"sibling origin is not a GitHub repository: {remote!r}")


def _require_official_origin(sibling: Path) -> None:
    repository = _origin_repository(sibling)
    if repository != EXPECTED_REPOSITORY.lower():
        raise PinError(
            f"sibling origin is {repository!r}, expected {EXPECTED_REPOSITORY!r}"
        )


def _verify_pushed_tag(sibling: Path, ref: str) -> tuple[str, str]:
    """Prove an annotated local tag and its peel both exist on official origin."""

    _require_official_origin(sibling)
    tag_ref = f"refs/tags/{ref}"
    if str(_git(sibling, "cat-file", "-t", tag_ref)).strip() != "tag":
        raise PinError(f"{ref} is not an annotated tag")
    tag_object = str(_git(sibling, "rev-parse", tag_ref)).strip()
    commit = str(_git(sibling, "rev-parse", f"{tag_ref}^{{commit}}")).strip()
    output = str(
        _git(
            sibling,
            "ls-remote",
            "--tags",
            "origin",
            tag_ref,
            f"{tag_ref}^{{}}",
        )
    )
    remote_refs: dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split()
        if len(parts) == 2:
            remote_refs[parts[1]] = parts[0]
    expected = {tag_ref: tag_object, f"{tag_ref}^{{}}": commit}
    if remote_refs != expected:
        raise PinError(
            f"tag {ref} is not pushed unchanged to official origin: "
            f"expected={expected}, remote={remote_refs}"
        )
    return tag_object, commit


def _load_lock() -> dict[str, Any]:
    try:
        lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PinError(f"cannot read {LOCK_PATH}: {exc}") from exc

    required = {
        "schemaVersion",
        "repository",
        "ref",
        "commit",
        "sourceRoot",
        "omittedFiles",
        "omittedPrefixes",
        "vendoredFileCount",
        "contentSha256",
        "providersSha256",
    }
    missing = sorted(required - set(lock))
    if missing:
        raise PinError(f"vendor lock is missing keys: {missing}")
    if lock["schemaVersion"] != 1:
        raise PinError(f"unsupported vendor-lock schema: {lock['schemaVersion']!r}")
    if lock["repository"] != EXPECTED_REPOSITORY:
        raise PinError(f"unexpected source repository: {lock['repository']!r}")
    if lock["sourceRoot"] != EXPECTED_SOURCE_ROOT:
        raise PinError(f"unexpected source root: {lock['sourceRoot']!r}")
    if set(lock["omittedFiles"]) != EXPECTED_OMITTED_FILES:
        raise PinError("vendor-lock omittedFiles changed; review the executable boundary first")
    if set(lock["omittedPrefixes"]) != EXPECTED_OMITTED_PREFIXES:
        raise PinError("vendor-lock omittedPrefixes changed; review the executable boundary first")
    if not str(lock["ref"]).startswith("engine-v"):
        raise PinError(f"vendor ref is not an engine release tag: {lock['ref']!r}")
    commit = str(lock["commit"])
    if len(commit) != 40 or any(ch not in "0123456789abcdef" for ch in commit.lower()):
        raise PinError(f"vendor commit is not a full Git SHA: {commit!r}")
    return lock


def _source_path(rel: str, source_root: str) -> str:
    return "providers.json" if rel == "providers.json" else f"{source_root}/{rel}"


def _source_boundary(sibling: Path, commit: str, lock: dict[str, Any]) -> set[str]:
    source_root = str(lock["sourceRoot"])
    output = str(_git(sibling, "ls-tree", "-r", "--name-only", commit, source_root))
    candidates: set[str] = set()
    prefix = f"{source_root}/"
    for source_path in output.splitlines():
        if not source_path.startswith(prefix):
            continue
        rel = source_path[len(prefix) :]
        if rel in EXPECTED_OMITTED_FILES:
            continue
        if any(rel.startswith(omitted) for omitted in EXPECTED_OMITTED_PREFIXES):
            continue
        candidates.add(rel)
    return candidates


def _tag_entries(sibling: Path, lock: dict[str, Any]) -> dict[str, bytes]:
    commit = str(lock["commit"])
    source_root = str(lock["sourceRoot"])
    vendored = set(_vendored_paths())
    engine_vendored = vendored - {"providers.json"}
    engine_source = _source_boundary(sibling, commit, lock)
    missing = sorted(engine_source - engine_vendored)
    extra = sorted(engine_vendored - engine_source)
    if missing or extra:
        raise PinError(
            "vendored/source path boundary differs at the locked commit; "
            f"missing={missing}, extra={extra}"
        )

    entries: dict[str, bytes] = {}
    for rel in sorted(vendored):
        source_path = _source_path(rel, source_root)
        entries[rel] = bytes(_git(sibling, "show", f"{commit}:{source_path}", text=False))
    return entries


def _verify_worktree(lock: dict[str, Any]) -> dict[str, bytes]:
    entries = _worktree_entries()
    actual_count = len(entries)
    actual_digest = _aggregate(entries)
    provider_digest = _sha256(_normalise(entries["providers.json"]))
    if actual_count != int(lock["vendoredFileCount"]):
        raise PinError(
            f"vendored file count changed: lock={lock['vendoredFileCount']}, actual={actual_count}"
        )
    if actual_digest != str(lock["contentSha256"]).upper():
        raise PinError(
            "vendored content differs from VENDOR_LOCK.json: "
            f"lock={lock['contentSha256']}, actual={actual_digest}"
        )
    if provider_digest != str(lock["providersSha256"]).upper():
        raise PinError(
            "providers.json differs from its pin: "
            f"lock={lock['providersSha256']}, actual={provider_digest}"
        )

    provenance = PROVENANCE_PATH.read_text(encoding="utf-8")
    for value in (str(lock["ref"]), str(lock["commit"])[:7]):
        if value not in provenance:
            raise PinError(f"PROVENANCE.md does not record locked value {value!r}")
    return entries


def _verify_sibling(sibling: Path, lock: dict[str, Any], worktree: dict[str, bytes]) -> None:
    _require_official_origin(sibling)
    tag_ref = f"refs/tags/{lock['ref']}"
    object_type = str(_git(sibling, "cat-file", "-t", tag_ref)).strip()
    if object_type != "tag":
        raise PinError(f"{lock['ref']} must be an annotated tag, got {object_type!r}")
    peeled = str(_git(sibling, "rev-parse", f"{tag_ref}^{{commit}}")).strip()
    if peeled.lower() != str(lock["commit"]).lower():
        raise PinError(
            f"tag {lock['ref']} moved: lock={lock['commit']}, repository={peeled}"
        )

    source = _tag_entries(sibling, lock)
    if _aggregate(source) != _aggregate(worktree):
        drifted = sorted(
            rel
            for rel in worktree
            if _normalise(worktree[rel]) != _normalise(source[rel])
        )
        raise PinError(f"vendored content differs from locked tag {lock['ref']}: {drifted}")
    if _sha256(_normalise(source["providers.json"])) != str(lock["providersSha256"]).upper():
        raise PinError(f"locked tag's providers.json does not match {lock['providersSha256']}")


def _lock_payload(sibling: Path, ref: str) -> dict[str, Any]:
    _tag_object, commit = _verify_pushed_tag(sibling, ref)
    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "repository": EXPECTED_REPOSITORY,
        "ref": ref,
        "commit": commit,
        "sourceRoot": EXPECTED_SOURCE_ROOT,
        "omittedFiles": sorted(EXPECTED_OMITTED_FILES),
        "omittedPrefixes": sorted(EXPECTED_OMITTED_PREFIXES),
        "vendoredFileCount": 0,
        "contentSha256": "",
        "providersSha256": "",
    }
    worktree = _worktree_entries()
    source = _tag_entries(sibling, payload)
    if _aggregate(source) != _aggregate(worktree):
        drifted = sorted(
            rel
            for rel in worktree
            if _normalise(worktree[rel]) != _normalise(source[rel])
        )
        raise PinError(f"refusing to pin a non-matching vendor tree: {drifted}")
    payload["vendoredFileCount"] = len(worktree)
    payload["contentSha256"] = _aggregate(worktree)
    payload["providersSha256"] = _sha256(_normalise(worktree["providers.json"]))
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sibling",
        type=Path,
        default=Path(os.environ.get("CEDOCUMENTMAPPER_REPO", DEFAULT_SIBLING)),
        help="path to the cedocumentmapper_v2.0 clone",
    )
    parser.add_argument("--ref", help="engine tag to use with --write")
    parser.add_argument(
        "--write",
        action="store_true",
        help="write VENDOR_LOCK.json after proving the vendored tree matches --ref",
    )
    args = parser.parse_args(argv)

    try:
        sibling = args.sibling.resolve()
        if args.write:
            if not args.ref:
                raise PinError("--write requires --ref engine-vX.Y")
            if not (sibling / ".git").exists():
                raise PinError(f"sibling repository is unavailable at {sibling}")
            payload = _lock_payload(sibling, args.ref)
            LOCK_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
            print(f"[vendor-pin] wrote {LOCK_PATH} for {payload['ref']} @ {payload['commit']}")
            return 0

        lock = _load_lock()
        worktree = _verify_worktree(lock)
        if (sibling / ".git").exists():
            _verify_sibling(sibling, lock, worktree)
            print(
                f"[vendor-pin] PASS {lock['ref']} @ {lock['commit']} "
                f"({lock['vendoredFileCount']} files; immutable tag verified)"
            )
        else:
            print(
                f"[vendor-pin] PASS {lock['ref']} @ {lock['commit']} "
                f"({lock['vendoredFileCount']} files; offline lock verified)"
            )
        return 0
    except (OSError, PinError, UnicodeDecodeError) as exc:
        print(f"[vendor-pin] FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
