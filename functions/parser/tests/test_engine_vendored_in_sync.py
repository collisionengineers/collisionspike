"""Guard the deployed parser engine with an immutable, branch-independent pin.

Historically this test compared the vendor tree with whichever sibling branch
happened to be checked out and skipped completely when the private sibling was
absent (including CI).  The executable verifier now always checks the
self-contained ``VENDOR_LOCK.json`` digest and, when a sibling clone is present,
reads the locked tag/commit with Git rather than reading its working tree.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
PARSER_ROOT = HERE.parent
VERIFY_SCRIPT = PARSER_ROOT / "scripts" / "verify_vendor_pin.py"


def test_vendored_engine_matches_immutable_pin() -> None:
    """The always-on lock and optional sibling-tag verification must both pass."""

    proc = subprocess.run(
        [sys.executable, str(VERIFY_SCRIPT)],
        cwd=PARSER_ROOT,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, (
        "immutable parser vendor-pin verification failed\n"
        f"stdout:\n{proc.stdout}\n"
        f"stderr:\n{proc.stderr}"
    )
    assert "[vendor-pin] PASS" in proc.stdout
