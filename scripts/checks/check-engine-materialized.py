#!/usr/bin/env python3
"""Verify every deployed function's cedocumentmapper_v2/ copy matches the canonical engine.

Replaces the old cross-repo vendor-pin verifier now that
services/engine/cedocumentmapper_v2/ is this repository's own authored source
(not a separate authoring repository pinned by tag/commit). There is only one
source now, so this check is a plain byte-identity comparison: materialize each
target into a scratch directory with scripts/build/sync-engine.py and diff it
against what's actually committed. A mismatch means someone hand-edited a
materialized copy, or edited the canonical source and forgot to re-run
sync-engine.py — either way the fix is the same: `python scripts/build/sync-engine.py`,
then commit the result.
"""

from __future__ import annotations

import filecmp
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SYNC_SCRIPT = REPO_ROOT / "scripts" / "build" / "sync-engine.py"

TARGETS = (
    REPO_ROOT / "services" / "functions" / "parser" / "cedocumentmapper_v2",
    REPO_ROOT / "services" / "functions" / "ocr" / "cedocumentmapper_v2",
)


def _tree_files(root: Path) -> set[str]:
    return {
        p.relative_to(root).as_posix()
        for p in root.rglob("*")
        if p.is_file() and "__pycache__" not in p.parts
    }


def main() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="ce-engine-check-") as scratch_dir:
        scratch = Path(scratch_dir)
        for target in TARGETS:
            label = target.relative_to(REPO_ROOT).as_posix()
            fresh = scratch / target.parent.name / target.name
            proc = subprocess.run(
                [sys.executable, str(SYNC_SCRIPT), "--target", str(fresh)],
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                failures.append(f"{label}: sync-engine.py failed:\n{proc.stdout}\n{proc.stderr}")
                continue

            committed_files = _tree_files(target)
            fresh_files = _tree_files(fresh)
            missing = sorted(fresh_files - committed_files)
            extra = sorted(committed_files - fresh_files)
            if missing or extra:
                failures.append(
                    f"{label}: file set differs from a fresh materialization "
                    f"(missing={missing}, extra={extra})"
                )
                continue

            mismatch, errors = filecmp.cmpfiles(
                target, fresh, sorted(committed_files), shallow=False
            )[1:3]
            if mismatch or errors:
                failures.append(
                    f"{label}: content differs from a fresh materialization "
                    f"(changed={sorted(mismatch)}, unreadable={sorted(errors)})"
                )

    if failures:
        print("[check-engine-materialized] FAIL", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "\nFix: python scripts/build/sync-engine.py && git add -A "
            "services/functions/parser/cedocumentmapper_v2 "
            "services/functions/ocr/cedocumentmapper_v2",
            file=sys.stderr,
        )
        return 1

    print(f"[check-engine-materialized] PASS ({len(TARGETS)} materialized targets checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
