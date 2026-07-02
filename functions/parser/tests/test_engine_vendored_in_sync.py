"""Guard: the vendored ``cedocumentmapper_v2`` engine must stay in sync with the sibling.

``functions/parser/cedocumentmapper_v2/`` is a VENDORED copy of the engine that
ships inside the FC1 deployment package. The sibling repo
``collisionengineers/cedocumentmapper_v2.0`` (``src/cedocumentmapper_v2/``) is the
AUTHORING source of truth — all engine edits land there first, then this copy is
re-cut by the command in ``cedocumentmapper_v2/PROVENANCE.md``. This test fails
when the two drift apart so a change in one place is never silently lost.

As of the ``engine-v2.1`` tag (2026-07-02) the vendored copy is a TRUE MIRROR of
the sibling for every shared file (ADR-0018 Decision 3): both the ROADMAP-B2
claimant-contact extraction (previously vendored-only, hand-re-applied after
every re-cut) and the earlier audit-case-type / engineer-report overlay
(previously sibling-only) are now upstreamed and converged on both sides.
``RECONCILED_MODULES`` is therefore empty and every shared module — including
the bundled JSON resources, closing a prior blind spot — is byte-compared with
no exceptions. Two things are still expected to differ and are tolerated here:

  * Two OMITTED modules (``cli.py``, ``ui/host.py``) — pulled off the FC1 path
    (desktop/CLI-only, never imported by the deployed Function).
  * The pinned ``providers.json`` seed (authoritative in the vendored copy —
    it may intentionally lag or lead the sibling's own seed).

The marker-based reconciliation mechanism (``_VENDORED_MARKERS`` /
``_SIBLING_MARKERS`` and their two test functions) is kept available, empty,
for the next time a reconciliation becomes unavoidable (e.g. a future
vendored-only hotfix pending upstream) — populate the dicts and add the file
to ``RECONCILED_MODULES`` to exclude it from the plain byte-compare while
still pinning the pieces that must survive on both sides.

The sibling repo is checked out one directory up from the collisionspike repo on
a dev box; in CI it is usually absent. Like ``test_schema_vendored_in_sync``,
this test SKIPS cleanly when the sibling source cannot be found.
"""

from __future__ import annotations

from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
VENDORED_ROOT = HERE.parent / "cedocumentmapper_v2"

# The sibling lives one level up from the collisionspike repo root:
#   .../GitHub/collisionspike/functions/parser/tests/  (HERE)
#   .../GitHub/cedocumentmapper_v2.0/src/cedocumentmapper_v2/  (sibling source)
_REPO_ROOT = HERE.parents[2]  # .../collisionspike
SIBLING_ROOT = _REPO_ROOT.parent / "cedocumentmapper_v2.0" / "src" / "cedocumentmapper_v2"

# Modules intentionally NOT vendored (off the FC1 worker path).
OMITTED_MODULES = {"cli.py", "ui/host.py"}

# Files carrying an ACTIVE, unreconciled divergence, excluded from the plain
# byte-compare and checked by marker instead (see _VENDORED_MARKERS /
# _SIBLING_MARKERS below). Empty as of engine-v2.1 -- both prior
# reconciliations (ROADMAP-B2 claimant-contact extraction, and the
# audit-case-type / engineer-report overlay) are now fully converged and
# covered by the plain byte-compare like everything else.
RECONCILED_MODULES: set[str] = set()

# Non-source files we never byte-compare (the seed pin + this guard's own docs).
NON_COMPARED = {"providers.json", "PROVENANCE.md"}

# Markers proving a reconciliation is intact in the VENDORED copy, keyed by
# vendored-relative path. Populate alongside RECONCILED_MODULES the next time a
# file must carry an intentional, tracked divergence.
_VENDORED_MARKERS: dict[str, tuple[str, ...]] = {}

# Markers proving the SIBLING source still carries the pieces a reconciliation
# depends on bringing in. Populate alongside _VENDORED_MARKERS.
_SIBLING_MARKERS: dict[str, tuple[str, ...]] = {}


def _sibling_available() -> bool:
    return SIBLING_ROOT.exists() and (SIBLING_ROOT / "__init__.py").exists()


def _norm(text: str) -> str:
    """Normalise line endings + trailing whitespace so CRLF/LF and stray spaces
    don't masquerade as real drift."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(line.rstrip() for line in lines)


def _vendored_py_files() -> list[str]:
    files: list[str] = []
    for path in VENDORED_ROOT.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        files.append(path.relative_to(VENDORED_ROOT).as_posix())
    return sorted(files)


def _vendored_resource_json_files() -> list[str]:
    """Vendored ``resources/*.json`` files (relative to VENDORED_ROOT).

    Scoped to ``resources/`` only -- NOT the whole tree -- so the pinned
    top-level ``providers.json`` seed (deliberately excluded; see
    NON_COMPARED) is never swept in here.
    """
    resources_dir = VENDORED_ROOT / "resources"
    if not resources_dir.is_dir():
        return []
    return sorted(
        path.relative_to(VENDORED_ROOT).as_posix()
        for path in resources_dir.glob("*.json")
    )


pytestmark = pytest.mark.skipif(
    not _sibling_available(),
    reason=f"sibling engine source not found at {SIBLING_ROOT} (expected on dev boxes only)",
)


def test_no_omitted_module_was_vendored() -> None:
    """The two off-path modules must NOT be present in the vendored copy."""
    vendored = set(_vendored_py_files())
    leaked = OMITTED_MODULES & vendored
    assert not leaked, f"omitted modules unexpectedly vendored: {sorted(leaked)}"


def test_every_vendored_module_exists_in_sibling() -> None:
    """No vendored module is orphaned — each maps back to a sibling source file."""
    for rel in _vendored_py_files():
        assert (SIBLING_ROOT / rel).exists(), (
            f"vendored module {rel!r} has no sibling source — it was either renamed "
            f"upstream or hand-added to the vendored copy (forbidden)."
        )


def test_shared_unreconciled_modules_are_byte_identical() -> None:
    """Every shared, non-reconciled .py module must match the sibling source
    (ignoring line endings/trailing whitespace)."""
    drifted: list[str] = []
    for rel in _vendored_py_files():
        if rel in RECONCILED_MODULES or rel in OMITTED_MODULES:
            continue
        sibling = SIBLING_ROOT / rel
        if not sibling.exists():
            continue  # covered by test_every_vendored_module_exists_in_sibling
        vend_text = _norm((VENDORED_ROOT / rel).read_text(encoding="utf-8"))
        sib_text = _norm(sibling.read_text(encoding="utf-8"))
        if vend_text != sib_text:
            drifted.append(rel)
    assert not drifted, (
        "vendored engine drifted from sibling source for non-reconciled modules: "
        f"{drifted}. Re-cut per cedocumentmapper_v2/PROVENANCE.md."
    )


def test_vendored_resource_schemas_are_byte_identical() -> None:
    """Bundled JSON schema resources (e.g. eva-json.schema.json) must match the
    sibling source too -- previously a blind spot (only *.py was walked), closed
    when the ROADMAP-B2 claimant-contact schema properties were upstreamed."""
    drifted: list[str] = []
    missing: list[str] = []
    for rel in _vendored_resource_json_files():
        sibling = SIBLING_ROOT / rel
        if not sibling.exists():
            missing.append(rel)
            continue
        vend_text = _norm((VENDORED_ROOT / rel).read_text(encoding="utf-8"))
        sib_text = _norm(sibling.read_text(encoding="utf-8"))
        if vend_text != sib_text:
            drifted.append(rel)
    assert not missing, f"vendored resource JSON has no sibling source: {missing}"
    assert not drifted, (
        "vendored resource JSON drifted from sibling source: "
        f"{drifted}. Re-cut per cedocumentmapper_v2/PROVENANCE.md."
    )


def test_vendored_reconciliation_markers_present() -> None:
    """Any recorded reconciliation must survive in the vendored copy.

    Currently a no-op (_VENDORED_MARKERS is empty as of engine-v2.1 -- see
    module docstring); kept so the pattern is ready to reuse.
    """
    missing: list[str] = []
    for rel, markers in _VENDORED_MARKERS.items():
        text = (VENDORED_ROOT / rel).read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                missing.append(f"{rel}: {marker!r}")
    assert not missing, (
        "vendored reconciliation markers missing (a re-cut dropped a tracked "
        f"reconciliation): {missing}"
    )


def test_sibling_still_carries_brought_in_pieces() -> None:
    """The sibling source must still carry any piece the vendored copy depends
    on bringing in.

    Currently a no-op (_SIBLING_MARKERS is empty as of engine-v2.1 -- see
    module docstring); kept so the pattern is ready to reuse.
    """
    missing: list[str] = []
    for rel, markers in _SIBLING_MARKERS.items():
        sibling = SIBLING_ROOT / rel
        if not sibling.exists():
            missing.append(f"{rel}: FILE MISSING")
            continue
        text = sibling.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                missing.append(f"{rel}: {marker!r}")
    assert not missing, (
        "sibling source lost a piece the vendored copy depends on bringing in: "
        f"{missing}. Reconcile PROVENANCE.md before re-cutting."
    )


def test_providers_seed_is_pinned_not_clobbered() -> None:
    """The vendored providers.json seed must exist (the adapter pins to it). It is
    authoritative for the deployed Function and not part of the byte-compare."""
    assert (VENDORED_ROOT / "providers.json").exists(), "vendored providers.json seed missing"
    assert NON_COMPARED  # documents intent: seed + PROVENANCE.md are never byte-compared
