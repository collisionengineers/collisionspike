"""Guard the deployed parser engine with an immutable, branch-independent pin.

The executable verifier always checks the
self-contained ``VENDOR_LOCK.json`` digest and, when a sibling clone is present,
reads the locked tag/commit with Git rather than reading its working tree.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest


HERE = Path(__file__).resolve().parent
PARSER_ROOT = HERE.parent
VERIFY_SCRIPT = PARSER_ROOT / "scripts" / "verify_vendor_pin.py"


def _verifier_module():
    spec = importlib.util.spec_from_file_location("verify_vendor_pin", VERIFY_SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def test_wording_normalisation_accepts_docstring_only_change() -> None:
    verifier = _verifier_module()
    verifier._verify_wording_normalisation(
        "example.py",
        b'"""Original wording."""\n\ndef answer() -> int:\n    return 42\n',
        b'"""Current wording."""\n\ndef answer() -> int:\n    return 42\n',
    )


def test_wording_normalisation_rejects_executable_change() -> None:
    verifier = _verifier_module()
    with pytest.raises(verifier.PinError, match="executable Python structure"):
        verifier._verify_wording_normalisation(
            "example.py",
            b'def answer() -> int:\n    return 42\n',
            b'def answer() -> int:\n    return 43\n',
        )
