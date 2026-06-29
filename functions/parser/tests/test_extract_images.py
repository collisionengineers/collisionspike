"""Tests for the parser /extract-images route + the run_image_extraction seam.

Two layers:
  * ROUTE: ``function_app.extract_images_route`` called directly with a hand-built
    HttpRequest, with ``parser_adapter.run_image_extraction`` monkeypatched — no heavy
    deps, exercises the request contract + envelope (like test_parse).
  * ENGINE: ``run_image_extraction`` over the REAL "IMAGES - CVD.pdf" sample (the
    pdf-image-extraction ticket's fixture) — proves embedded photos come back as bytes
    + sha256 + stable metadata, and that a text-only instruction PDF yields zero
    (NOT an error). Skips cleanly where PyMuPDF / the sample are absent.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import azure.functions as func
import pytest

HERE = Path(__file__).resolve().parent
INSTRUCTIONS = HERE / "fixtures" / "instructions"
REPO_ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

import function_app  # noqa: E402
import parser_adapter  # noqa: E402

_CVD_PDF = (
    REPO_ROOT / "docs" / "plans" / "work-todo-spike" / "pdf-image-extraction" / "IMAGES - CVD.pdf"
)


def _fitz_available() -> bool:
    try:
        import fitz  # noqa: F401
    except Exception:
        return False
    return True


def _make_request(body: dict | None, raw_body: bytes | None = None) -> func.HttpRequest:
    payload = raw_body if raw_body is not None else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/extract-images",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def _valid_body() -> dict:
    return {"document": base64.b64encode(b"%PDF-1.4 fake").decode("ascii"), "filename": "doc.pdf"}


# --------------------------------------------------------------------------- #
# Route contract (monkeypatched engine)                                       #
# --------------------------------------------------------------------------- #
def test_route_returns_images_envelope(monkeypatch):
    fake = {
        "count": 2,
        "images": [
            {"filename": "a.jpeg", "ext": "jpeg", "content_type": "image/jpeg",
             "size": 10, "sha256": "x" * 64, "content_base64": "QQ==", "sequence_index": 1},
            {"filename": "b.png", "ext": "png", "content_type": "image/png",
             "size": 20, "sha256": "y" * 64, "content_base64": "Qg==", "sequence_index": 2},
        ],
        "message": "Successfully extracted 2 image(s).",
    }
    monkeypatch.setattr(parser_adapter, "run_image_extraction", lambda *a, **k: fake)
    resp = function_app.extract_images_route(_make_request(_valid_body()))
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["count"] == 2
    assert len(data["images"]) == 2
    assert data["images"][0]["sequence_index"] == 1
    assert data["contract_version"] == function_app.IMAGES_CONTRACT_VERSION


def test_route_missing_document_is_400():
    resp = function_app.extract_images_route(_make_request({"filename": "x.pdf"}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["count"] == 0


def test_route_unreadable_document_is_422(monkeypatch):
    def _raise(*a, **k):
        raise parser_adapter.DocumentUnreadableError("corrupt")

    monkeypatch.setattr(parser_adapter, "run_image_extraction", _raise)
    resp = function_app.extract_images_route(_make_request(_valid_body()))
    assert resp.status_code == 422


def test_route_zero_images_is_200(monkeypatch):
    monkeypatch.setattr(
        parser_adapter, "run_image_extraction", lambda *a, **k: {"count": 0, "images": [], "message": ""}
    )
    resp = function_app.extract_images_route(_make_request(_valid_body()))
    assert resp.status_code == 200
    assert json.loads(resp.get_body())["count"] == 0


# --------------------------------------------------------------------------- #
# Real engine over the CVD sample                                             #
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(not _CVD_PDF.exists(), reason="IMAGES - CVD.pdf sample not present (dev-box only)")
@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
def test_real_pdf_yields_image_bytes_and_sha():
    res = parser_adapter.run_image_extraction(_CVD_PDF.read_bytes(), "IMAGES - CVD.pdf")
    assert res["count"] >= 1, "expected embedded vehicle photos in the CVD images PDF"
    seqs = []
    for im in res["images"]:
        assert im["content_type"].startswith("image/"), im
        assert len(im["sha256"]) == 64
        assert im["size"] > 0
        # Bytes round-trip through base64 and match the recorded size.
        raw = base64.b64decode(im["content_base64"])
        assert len(raw) == im["size"]
        seqs.append(im["sequence_index"])
    # sequence_index is 1-based and strictly increasing (stable ordering for EVA).
    assert seqs == sorted(set(seqs)) and seqs[0] == 1


@pytest.mark.skipif(not _fitz_available(), reason="PyMuPDF not installed on this runner")
def test_text_only_pdf_yields_zero_images_not_error():
    src = INSTRUCTIONS / "KBS INSTRUCT 01.pdf"
    if not src.exists():
        pytest.skip("KBS instruction PDF fixture not present")
    res = parser_adapter.run_image_extraction(src.read_bytes(), "KBS INSTRUCT 01.pdf")
    assert res["count"] == 0  # an instruction-text PDF has no embedded vehicle photos


def test_unsupported_suffix_yields_zero():
    res = parser_adapter.run_image_extraction(b"hello world", "note.txt")
    assert res["count"] == 0
