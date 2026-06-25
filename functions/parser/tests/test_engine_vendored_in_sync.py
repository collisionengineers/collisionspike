"""Guard: the vendored ``cedocumentmapper_v2`` engine must stay in sync with the sibling.

``functions/parser/cedocumentmapper_v2/`` is a VENDORED copy of the engine that
ships inside the FC1 deployment package. The sibling repo
``collisionengineers/cedocumentmapper_v2.0`` (``src/cedocumentmapper_v2/``) is the
AUTHORING source of truth — all engine edits land there first, then this copy is
re-cut by the command in ``cedocumentmapper_v2/PROVENANCE.md``. This test fails
when the two drift apart so a change in one place is never silently lost.

The vendored copy is a deliberate SUPERSET, not a byte-mirror. Three things are
expected to differ and are tolerated here:

  * Two OMITTED modules (``cli.py``, ``ui/host.py``) — pulled off the FC1 path.
  * The pinned ``providers.json`` seed (authoritative in the vendored copy).
  * The recorded RECONCILIATIONS — the vendored-only ROADMAP-B2 contact
    extraction and the sibling-only engineer-report overlay/notes (see
    PROVENANCE.md). For those files we don't byte-compare; we assert the
    reconciliation markers are present on BOTH sides as appropriate.

Every other shared module must be byte-identical (ignoring line endings).

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

# Files that carry a recorded reconciliation; excluded from the byte-compare and
# checked by marker instead (see _RECONCILIATION_MARKERS).
RECONCILED_MODULES = {
    "domain/models.py",
    "application/service.py",
    "rules/engine.py",
    "normalization/normalizers.py",
    "normalization/__init__.py",
}

# Non-source files we never byte-compare (the seed pin + this guard's own docs).
NON_COMPARED = {"providers.json", "PROVENANCE.md"}

# Markers that prove the reconciliations are intact in the VENDORED copy. Keyed by
# vendored-relative path; each entry is (must-contain markers). These pin both the
# vendored-only B2 contact extraction AND the sibling-only overlay/notes.
_VENDORED_MARKERS: dict[str, tuple[str, ...]] = {
    # B2 (vendored-only) + notes (sibling-only) both live here.
    "domain/models.py": (
        "CLAIMANT_TELEPHONE",
        "CLAIMANT_EMAIL",
        "notes: tuple[str, ...] = ()",
        "is_audit: bool = False",
    ),
    # Overlay (sibling-only) lives here; no B2 here.
    "application/service.py": (
        "overlay_records_with_overrides",
        "detect_engineer_provider",
        '"notes": list(record.notes)',
        '"is_audit": record.is_audit',
    ),
    # B2 (vendored-only) lives here; image-based (converged) too; the Phase-8
    # email-classifier keyword tuples are CONVERGED (added identically to both
    # copies, exported for rules/email_classifier.py).
    "rules/engine.py": (
        "_fallback_telephone",
        "_fallback_email",
        "_CLAIMANT_CONTEXT_WORDS",
        "IMAGE_BASED_ASSESSMENT",
        "detect_audit_signals",
        "_WORK_KEYWORDS",
        "_QUERY_KEYWORDS",
        "_match_keywords",
    ),
    "normalization/normalizers.py": (
        "TELEPHONE_RE",
        "EMAIL_RE",
        "def normalize_telephone",
        "def normalize_email",
    ),
    "normalization/__init__.py": (
        "normalize_telephone",
        "normalize_email",
    ),
}

# Markers that prove the SIBLING source still carries the pieces we expect to
# bring in (the overlay/notes). If the sibling drops these, the re-vendor command
# would silently lose them — so we flag it.
_SIBLING_MARKERS: dict[str, tuple[str, ...]] = {
    "domain/models.py": ("notes: tuple[str, ...] = ()", "is_audit: bool = False"),
    "application/service.py": (
        "overlay_records_with_overrides",
        "detect_engineer_provider",
        '"is_audit": record.is_audit',
    ),
    # Image-based (converged) + audit-detection + the Phase-8 email-classifier
    # keyword tuples must exist on both sides (else a re-cut loses them).
    "rules/engine.py": (
        "IMAGE_BASED_ASSESSMENT",
        "detect_audit_signals",
        "_WORK_KEYWORDS",
        "_QUERY_KEYWORDS",
        "_match_keywords",
    ),
}


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


def test_vendored_reconciliation_markers_present() -> None:
    """The recorded reconciliations (B2 contact extraction + overlay/notes) must
    survive in the vendored copy."""
    missing: list[str] = []
    for rel, markers in _VENDORED_MARKERS.items():
        text = (VENDORED_ROOT / rel).read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                missing.append(f"{rel}: {marker!r}")
    assert not missing, (
        "vendored reconciliation markers missing (a re-cut dropped a B2/overlay "
        f"reconciliation): {missing}"
    )


def test_sibling_still_carries_brought_in_pieces() -> None:
    """The sibling source must still carry the overlay/notes we vendor in (and the
    converged image-based normalisation), else a re-cut would silently lose them."""
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
