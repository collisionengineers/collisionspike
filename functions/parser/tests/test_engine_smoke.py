"""Engine-level end-to-end smoke test over a small vendored regression slice.

Runs the REAL ``DocumentMapperService`` (vendored ``cedocumentmapper_v2``) over a
handful of representative instruction documents and checks the extracted native
fields against checked-in goldens. This exercises the whole engine path — reader
-> provider detection -> rule extraction -> normalisation — on the SAME vendored
copy and SAME ``providers.json`` seed the FC1 Function uses, so a regression in
the vendored engine is caught here rather than in production.

Heavy and dependency-bearing by design:

  * gated with ``pytest.importorskip("fitz")`` so it auto-skips where PyMuPDF is
    absent (e.g. a lean CI runner) — PyMuPDF is licensed/approved, this is purely
    a "deps not installed here" skip, never a licence concern;
  * the DOCX fixtures additionally need ``python-docx``; those cases skip
    individually when it is missing, while the PDF case still runs.

Goldens live in ``tests/fixtures/expected/*.expected.json`` and reference their
source document via ``source_file`` (relative to ``tests/fixtures/instructions``).
They use the parser's NATIVE field keys (e.g. ``incident_date``), not the EVA
contract keys — this guards the engine, not the EVA mapping (that is
``test_parse`` / the adapter tests).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# Skip the whole module when PyMuPDF is unavailable (lean CI). The PDF fixture
# needs it; we keep the gate at module level per the harness convention.
pytest.importorskip("fitz", reason="PyMuPDF (licensed/approved) not installed on this runner")

from cedocumentmapper_v2.application import DocumentMapperService
from cedocumentmapper_v2.domain.models import FieldKey

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
INSTRUCTIONS = FIXTURES / "instructions"
EXPECTED = FIXTURES / "expected"

# Pin the service to the VENDORED provider seed and a writable temp app-data dir,
# exactly as parser_adapter does on FC1 (no desktop-home writes).
_VENDORED_PROVIDERS_JSON = HERE.parent / "cedocumentmapper_v2" / "providers.json"


def _docx_available() -> bool:
    try:
        import docx  # noqa: F401
    except Exception:
        return False
    return True


def _fixtures() -> list[tuple[str, Path, Path]]:
    if not EXPECTED.exists():
        return []
    out: list[tuple[str, Path, Path]] = []
    for golden in sorted(EXPECTED.glob("*.expected.json")):
        data = json.loads(golden.read_text(encoding="utf-8"))
        src = INSTRUCTIONS / data["source_file"]
        if src.exists():
            out.append((data.get("fixture_id", golden.stem), src, golden))
    return out


_FIXTURES = _fixtures()


@pytest.mark.skipif(not _FIXTURES, reason="no vendored regression fixtures present")
@pytest.mark.parametrize("fixture_id,src,golden", _FIXTURES, ids=[f[0] for f in _FIXTURES])
def test_engine_end_to_end(fixture_id: str, src: Path, golden: Path, tmp_path: Path) -> None:
    if src.suffix.lower() in {".docx", ".doc"} and not _docx_available():
        pytest.skip("python-docx not installed; DOCX/DOC fixture skipped")

    expected = json.loads(golden.read_text(encoding="utf-8"))
    expected_values: dict[str, str] = expected["expected_values"]
    allowed_blanks = set(expected.get("allowed_blank_fields", []))

    service = DocumentMapperService(
        app_data_dir=tmp_path / "appdata",
        seed_path=_VENDORED_PROVIDERS_JSON,
    )
    _document, record = service.process_document(str(src))

    # Provider detection landed where the golden expects.
    assert record.provider.provider_id == expected["expected_provider"], (
        f"{fixture_id}: provider mismatch — expected "
        f"{expected['expected_provider']!r}, got {record.provider.provider_id!r}"
    )

    diffs: list[str] = []
    for field_name, want in expected_values.items():
        ext = record.fields.get(FieldKey(field_name))
        got = ext.value if ext else ""
        if got != want:
            if not got and field_name in allowed_blanks:
                continue
            diffs.append(f"  {field_name}: expected {want!r}, got {got!r}")
    assert not diffs, f"{fixture_id} extraction mismatched:\n" + "\n".join(diffs)


@pytest.mark.skipif(not _FIXTURES, reason="no vendored regression fixtures present")
@pytest.mark.parametrize("fixture_id,src,golden", _FIXTURES, ids=[f[0] for f in _FIXTURES])
def test_engine_record_to_dict_has_native_shape(
    fixture_id: str, src: Path, golden: Path, tmp_path: Path
) -> None:
    """The end-to-end record_to_dict carries the native shape the adapter expects:
    a top-level ``notes`` list (session provenance) that is NOT inside ``fields``,
    so it can never leak into the 12-field EVA payload."""
    if src.suffix.lower() in {".docx", ".doc"} and not _docx_available():
        pytest.skip("python-docx not installed; DOCX/DOC fixture skipped")

    service = DocumentMapperService(
        app_data_dir=tmp_path / "appdata",
        seed_path=_VENDORED_PROVIDERS_JSON,
    )
    _document, record = service.process_document(str(src))
    payload = service.record_to_dict(record)

    assert set(payload) >= {"provider", "fields", "issues", "notes"}
    assert isinstance(payload["notes"], list)
    # Session provenance rides at the TOP level only — never inside fields.
    assert "notes" not in payload["fields"]
