"""Genuine real-engine-path coverage for the OCR host.

Every other test in this suite monkeypatches ``_engine_available``/``run_ocr``
at the seam, so none of them ever actually imports and runs the real vendored
``cedocumentmapper_v2`` package now materialized alongside this host (see
scripts/build/sync-engine.py). This test does neither: it drives ``run_ocr``
end-to-end against a real one-page PDF, proving the whole chain the mocked
tests assume — real import, real DocumentMapperService wiring (app_data_dir +
the vendored providers.json seed), real EVA-envelope projection — actually
works, not just that the seam is called correctly.
"""

from __future__ import annotations

from pathlib import Path

import ocr_pdf_adapter

FIXTURE = Path(__file__).parent / "fixtures" / "collision-repair-estimate-01.pdf"


def test_engine_is_actually_available():
    assert ocr_pdf_adapter._engine_available() is True


def test_run_ocr_real_engine_path_extracts_from_a_real_pdf():
    result = ocr_pdf_adapter.run_ocr(FIXTURE.read_bytes(), FIXTURE.name)

    assert result["page_count"] == 1
    assert "REFRIGERANT" in result["ocr_text"] or "COLLISION REPAIR ESTIMATE" in result["ocr_text"]

    extraction = result["extraction"]
    assert extraction is not None
    for key in ocr_pdf_adapter.EVA_FIELD_ORDER:
        assert key in extraction
        assert {"value", "confidence", "source"} <= set(extraction[key])

    for key in ("vrm", "reference"):
        assert result[key] is None or {"value", "confidence", "source"} <= set(result[key])

    assert isinstance(result["issues"], list)
