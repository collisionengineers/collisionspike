"""Offline pytest suite for the OCR host.

Run from ocr/:
    python -m pytest

These tests monkeypatch the two adapter seams (``ocr_pdf_adapter.run_ocr`` and
``plate_adapter.read_plate``) so the heavy runtime deps (PyMuPDF / Tesseract /
fast-alpr / onnxruntime / requests) are NOT required. No network, no tenant, no
``func start``: each HTTP handler is called directly with a hand-built
``azure.functions.HttpRequest``. The pure plate-result logic
(``plate_adapter._build_result`` / ``normalise_vrm``) is also unit-tested directly.

Coverage:
  /ocr-pdf
    * happy path (engine present)   -> 200 with 12-field extraction + ocr_text
    * happy path (text only)        -> 200 with extraction=None + ocr_text
    * non-PDF filename              -> 400 unsupported_document
    * bad base64                    -> 400 bad_base64
    * missing document / filename   -> 400
    * OcrError                      -> 502
    * OCR_PROVIDER selection        -> reflected in response + passed to seam
  /plate-ocr
    * plate found + vrm match       -> 200 registration_visible/vrm_match true
    * vrm mismatch                  -> 200 vrm_match false
    * no case_vrm                   -> 200 vrm_match null
    * no plate                      -> 200 registration_visible false
    * unsupported image filename    -> 400
    * bad base64                    -> 400
    * PlateOcrError                 -> 502
  pure logic
    * normalise_vrm                 -> strips spaces/case/punct
    * _build_result                 -> picks matching candidate, filters non-plates
"""

from __future__ import annotations

import base64
import json

import azure.functions as func
import pytest

import function_app
import ocr_pdf_adapter
import plate_adapter
from ocr_pdf_adapter import OcrError
from plate_adapter import PlateOcrError, normalise_vrm


# --------------------------------------------------------------------------- #
# request builders                                                            #
# --------------------------------------------------------------------------- #
def _ocr_request(body: dict | None, raw_body: bytes | None = None) -> func.HttpRequest:
    payload = raw_body if raw_body is not None else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/ocr-pdf",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def _plate_request(body: dict | None, raw_body: bytes | None = None) -> func.HttpRequest:
    payload = raw_body if raw_body is not None else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/plate-ocr",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _valid_ocr_body() -> dict:
    return {"document": _b64(b"%PDF-1.4 fake image-only"), "filename": "scan.pdf"}


def _valid_plate_body(case_vrm: str | None = None) -> dict:
    body = {"image": _b64(b"\xff\xd8\xff fake jpeg"), "filename": "overview.jpg"}
    if case_vrm is not None:
        body["case_vrm"] = case_vrm
    return body


_EVA_KEYS = list(ocr_pdf_adapter.EVA_FIELD_ORDER)


def _engine_envelope() -> dict:
    """A run_ocr result as the FULL-engine path would return it."""
    extraction = {
        k: {"value": "", "confidence": None, "source": "absent"} for k in _EVA_KEYS
    }
    extraction["work_provider"] = {"value": "Scanned Provider", "confidence": 0.6, "source": "ocr_extraction"}
    extraction["vehicle_model"] = {"value": "Ford Focus", "confidence": 0.55, "source": "ocr_extraction"}
    return {
        "extraction": extraction,
        "vrm": {"value": "AB12CDE", "confidence": 0.6, "source": "vrm_regex"},
        "reference": {"value": "SCAN-1", "confidence": 0.6, "source": "ref_regex"},
        "ocr_text": "SCANNED PROVIDER\nFord Focus\nAB12 CDE",
        "page_count": 1,
        "issues": [],
    }


# --------------------------------------------------------------------------- #
# /ocr-pdf                                                                     #
# --------------------------------------------------------------------------- #
def test_ocr_pdf_engine_path_returns_200_with_extraction(monkeypatch):
    monkeypatch.setattr(ocr_pdf_adapter, "run_ocr", lambda *a, **k: _engine_envelope())

    resp = function_app.ocr_pdf(_ocr_request(_valid_ocr_body()))
    assert resp.status_code == 200

    data = json.loads(resp.get_body())
    assert list(data["extraction"].keys()) == _EVA_KEYS
    assert len(data["extraction"]) == 12
    assert data["extraction"]["work_provider"]["value"] == "Scanned Provider"
    # vrm / reference surfaced separately (Case-identity), NOT in the 12 keys.
    assert data["vrm"]["value"] == "AB12CDE"
    assert "vrm" not in data["extraction"]
    assert data["ocr_text"].startswith("SCANNED PROVIDER")
    assert data["page_count"] == 1
    assert data["contract_version"] == "ce_ocr_v1"
    assert data["ocr_provider"] == "tesseract"  # default


def test_ocr_pdf_text_only_path_returns_200_with_null_extraction(monkeypatch):
    text_only = {
        "extraction": None,
        "vrm": None,
        "reference": None,
        "ocr_text": "some recognised words",
        "page_count": 2,
        "issues": [],
    }
    monkeypatch.setattr(ocr_pdf_adapter, "run_ocr", lambda *a, **k: text_only)

    resp = function_app.ocr_pdf(_ocr_request(_valid_ocr_body()))
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["extraction"] is None
    assert data["ocr_text"] == "some recognised words"
    assert data["page_count"] == 2


def test_ocr_pdf_passes_provider_to_seam(monkeypatch):
    captured = {}

    def fake_run_ocr(document_bytes, filename, *, provider, provider_hint=None):
        captured["provider"] = provider
        captured["provider_hint"] = provider_hint
        return {"extraction": None, "vrm": None, "reference": None, "ocr_text": "x", "page_count": 1, "issues": []}

    monkeypatch.setenv("OCR_PROVIDER", "docintel")
    monkeypatch.setattr(ocr_pdf_adapter, "run_ocr", fake_run_ocr)

    body = _valid_ocr_body()
    body["provider_hint"] = "ACME"
    resp = function_app.ocr_pdf(_ocr_request(body))
    assert resp.status_code == 200
    assert captured["provider"] == "docintel"
    assert captured["provider_hint"] == "ACME"
    assert json.loads(resp.get_body())["ocr_provider"] == "docintel"


def test_ocr_pdf_unknown_provider_falls_back_to_tesseract(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "banana")
    monkeypatch.setattr(
        ocr_pdf_adapter,
        "run_ocr",
        lambda *a, **k: {"extraction": None, "vrm": None, "reference": None, "ocr_text": "", "page_count": 0, "issues": []},
    )
    resp = function_app.ocr_pdf(_ocr_request(_valid_ocr_body()))
    assert json.loads(resp.get_body())["ocr_provider"] == "tesseract"


def test_ocr_pdf_non_pdf_filename_returns_400(monkeypatch):
    monkeypatch.setattr(
        ocr_pdf_adapter, "run_ocr", lambda *a, **k: pytest.fail("run_ocr must not run on non-pdf")
    )
    body = {"document": _b64(b"x"), "filename": "notes.docx"}
    resp = function_app.ocr_pdf(_ocr_request(body))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "unsupported_document"


def test_ocr_pdf_bad_base64_returns_400(monkeypatch):
    monkeypatch.setattr(
        ocr_pdf_adapter, "run_ocr", lambda *a, **k: pytest.fail("run_ocr must not run on bad base64")
    )
    body = {"document": "not valid base64!!!", "filename": "scan.pdf"}
    resp = function_app.ocr_pdf(_ocr_request(body))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_base64"
    assert json.loads(resp.get_body())["extraction"] is None


def test_ocr_pdf_missing_document_returns_400():
    resp = function_app.ocr_pdf(_ocr_request({"filename": "scan.pdf"}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "missing_document"


def test_ocr_pdf_missing_filename_returns_400():
    resp = function_app.ocr_pdf(_ocr_request({"document": _b64(b"x")}))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "missing_filename"


def test_ocr_pdf_non_json_returns_400():
    resp = function_app.ocr_pdf(_ocr_request(None, raw_body=b"not json"))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_request"


def test_ocr_pdf_engine_error_returns_502(monkeypatch):
    def boom(*a, **k):
        raise OcrError("tesseract not found in container")

    monkeypatch.setattr(ocr_pdf_adapter, "run_ocr", boom)
    resp = function_app.ocr_pdf(_ocr_request(_valid_ocr_body()))
    assert resp.status_code == 502
    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "ocr_failed"
    assert "tesseract" in data["issues"][0]["message"]


# --------------------------------------------------------------------------- #
# /plate-ocr                                                                   #
# --------------------------------------------------------------------------- #
def test_plate_ocr_match_returns_200(monkeypatch):
    def fake_read(image_bytes, filename, *, case_vrm=None, provider="fast_alpr"):
        # The handler delegates match logic to the seam; here we model a match.
        return {
            "plate_text": "AB12 CDE",
            "confidence": 0.93,
            "registration_visible": True,
            "vrm_match": True,
            "raw_candidates": [{"text": "AB12 CDE", "confidence": 0.93}],
            "issues": [],
        }

    monkeypatch.setattr(plate_adapter, "read_plate", fake_read)
    resp = function_app.plate_ocr(_plate_request(_valid_plate_body("ab12cde")))
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["registration_visible"] is True
    assert data["vrm_match"] is True
    assert data["plate_text"] == "AB12 CDE"
    assert data["plate_provider"] == "fast_alpr"
    assert data["contract_version"] == "ce_ocr_v1"


def test_plate_ocr_no_case_vrm_returns_null_match(monkeypatch):
    def fake_read(image_bytes, filename, *, case_vrm=None, provider="fast_alpr"):
        assert case_vrm is None
        return {
            "plate_text": "XY99ZZZ",
            "confidence": 0.8,
            "registration_visible": True,
            "vrm_match": None,
            "raw_candidates": [],
            "issues": [],
        }

    monkeypatch.setattr(plate_adapter, "read_plate", fake_read)
    resp = function_app.plate_ocr(_plate_request(_valid_plate_body()))
    assert resp.status_code == 200
    assert json.loads(resp.get_body())["vrm_match"] is None


def test_plate_ocr_unsupported_image_returns_400(monkeypatch):
    monkeypatch.setattr(
        plate_adapter, "read_plate", lambda *a, **k: pytest.fail("must not run on bad ext")
    )
    body = {"image": _b64(b"x"), "filename": "doc.pdf"}
    resp = function_app.plate_ocr(_plate_request(body))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "unsupported_image"


def test_plate_ocr_bad_base64_returns_400(monkeypatch):
    monkeypatch.setattr(
        plate_adapter, "read_plate", lambda *a, **k: pytest.fail("must not run on bad base64")
    )
    body = {"image": "!!!notb64", "filename": "overview.png"}
    resp = function_app.plate_ocr(_plate_request(body))
    assert resp.status_code == 400
    assert json.loads(resp.get_body())["issues"][0]["code"] == "bad_base64"


def test_plate_ocr_error_returns_502(monkeypatch):
    def boom(*a, **k):
        raise PlateOcrError("fast-alpr model failed to load")

    monkeypatch.setattr(plate_adapter, "read_plate", boom)
    resp = function_app.plate_ocr(_plate_request(_valid_plate_body("ab12cde")))
    assert resp.status_code == 502
    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "plate_ocr_failed"
    assert data["registration_visible"] is False


# --------------------------------------------------------------------------- #
# pure plate logic (no monkeypatch — real functions)                          #
# --------------------------------------------------------------------------- #
def test_normalise_vrm_strips_case_space_punct():
    assert normalise_vrm("ab12 cde") == "AB12CDE"
    assert normalise_vrm("AB12-CDE") == "AB12CDE"
    assert normalise_vrm("  ab12cde ") == "AB12CDE"
    assert normalise_vrm(None) == ""
    assert normalise_vrm("") == ""


def test_build_result_picks_matching_candidate_over_higher_confidence():
    # A higher-confidence non-matching plate must NOT win when the case VRM is
    # present and a (lower-confidence) matching plate exists.
    candidates = [
        {"text": "XY99 ZZZ", "confidence": 0.99},  # plausible plate, but wrong
        {"text": "AB12 CDE", "confidence": 0.70},  # the case plate
    ]
    out = plate_adapter._build_result(candidates, case_vrm="ab12cde")
    assert out["vrm_match"] is True
    assert normalise_vrm(out["plate_text"]) == "AB12CDE"
    assert out["registration_visible"] is True


def test_build_result_mismatch_sets_false_and_issue():
    candidates = [{"text": "XY99 ZZZ", "confidence": 0.9}]
    out = plate_adapter._build_result(candidates, case_vrm="ab12cde")
    assert out["registration_visible"] is True  # a plate WAS read
    assert out["vrm_match"] is False
    assert any(i["code"] == "vrm_mismatch" for i in out["issues"])


def test_build_result_filters_non_plate_scene_text():
    # Random scene text (a road sign, a company name) must be filtered out so it
    # never sets registration_visible.
    candidates = [
        {"text": "FORD", "confidence": 0.9},          # letters only -> rejected
        {"text": "GIVE WAY", "confidence": 0.9},      # no digits -> rejected
        {"text": "12", "confidence": 0.9},            # too short -> rejected
    ]
    out = plate_adapter._build_result(candidates, case_vrm=None)
    assert out["registration_visible"] is False
    assert out["plate_text"] == ""
    assert any(i["code"] == "no_plate_found" for i in out["issues"])


def test_build_result_no_case_vrm_returns_best_candidate():
    candidates = [
        {"text": "AB12 CDE", "confidence": 0.6},
        {"text": "XY99 ZZZ", "confidence": 0.95},
    ]
    out = plate_adapter._build_result(candidates, case_vrm=None)
    assert out["vrm_match"] is None
    # Highest-confidence plausible plate wins when there is no case VRM to match.
    assert normalise_vrm(out["plate_text"]) == "XY99ZZZ"


# --------------------------------------------------------------------------- #
# tolerant decode — the connector gateway double-encode landmine               #
# (memory powerplatform-connector-base64-double-encode)                        #
# --------------------------------------------------------------------------- #
def test_ocr_pdf_recovers_double_base64_encoded_document(monkeypatch):
    # The Power Platform gateway can re-encode the base64 body a SECOND time. A
    # naive single decode would hand the engine base64-ASCII, not a PDF. The
    # handler must peel the redundant layer and pass real %PDF bytes to the seam.
    real_pdf = b"%PDF-1.4 scanned image only\n%%EOF"
    once = _b64(real_pdf)                       # what the flow SENDS
    twice = base64.b64encode(once.encode("ascii")).decode("ascii")  # gateway re-encodes

    seen = {}

    def fake_run_ocr(document_bytes, filename, *, provider, provider_hint=None):
        seen["bytes"] = document_bytes
        return {"extraction": None, "vrm": None, "reference": None, "ocr_text": "x", "page_count": 1, "issues": []}

    monkeypatch.setattr(ocr_pdf_adapter, "run_ocr", fake_run_ocr)
    resp = function_app.ocr_pdf(_ocr_request({"document": twice, "filename": "scan.pdf"}))
    assert resp.status_code == 200
    # The seam received the genuine PDF bytes, not the still-base64 inner string.
    assert seen["bytes"] == real_pdf


def test_ocr_pdf_single_encoded_document_is_unchanged(monkeypatch):
    # The normal (single-encoded) case must be untouched: a single decode already
    # yields %PDF, so no second peel happens.
    real_pdf = b"%PDF-1.7 ok"
    seen = {}

    def fake_run_ocr(document_bytes, filename, *, provider, provider_hint=None):
        seen["bytes"] = document_bytes
        return {"extraction": None, "vrm": None, "reference": None, "ocr_text": "x", "page_count": 1, "issues": []}

    monkeypatch.setattr(ocr_pdf_adapter, "run_ocr", fake_run_ocr)
    resp = function_app.ocr_pdf(_ocr_request({"document": _b64(real_pdf), "filename": "scan.pdf"}))
    assert resp.status_code == 200
    assert seen["bytes"] == real_pdf


def test_plate_ocr_recovers_double_base64_encoded_image(monkeypatch):
    # Same landmine on the image param: a double-encoded JPEG must be peeled so the
    # seam receives real \xff\xd8\xff image bytes, not the inner base64 ASCII.
    real_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF fake jpeg body"
    once = _b64(real_jpeg)
    twice = base64.b64encode(once.encode("ascii")).decode("ascii")

    seen = {}

    def fake_read(image_bytes, filename, *, case_vrm=None, provider="fast_alpr"):
        seen["bytes"] = image_bytes
        return {
            "plate_text": "AB12 CDE",
            "confidence": 0.9,
            "registration_visible": True,
            "vrm_match": None,
            "raw_candidates": [],
            "issues": [],
        }

    monkeypatch.setattr(plate_adapter, "read_plate", fake_read)
    resp = function_app.plate_ocr(_plate_request({"image": twice, "filename": "overview.jpg"}))
    assert resp.status_code == 200
    assert seen["bytes"] == real_jpeg


def test_plate_ocr_single_encoded_png_is_unchanged(monkeypatch):
    real_png = b"\x89PNG\r\n\x1a\n fake png body"
    seen = {}

    def fake_read(image_bytes, filename, *, case_vrm=None, provider="fast_alpr"):
        seen["bytes"] = image_bytes
        return {
            "plate_text": "", "confidence": None, "registration_visible": False,
            "vrm_match": None, "raw_candidates": [], "issues": [],
        }

    monkeypatch.setattr(plate_adapter, "read_plate", fake_read)
    resp = function_app.plate_ocr(_plate_request({"image": _b64(real_png), "filename": "overview.png"}))
    assert resp.status_code == 200
    assert seen["bytes"] == real_png


def test_peel_double_base64_leaves_unrecognised_payload_alone():
    # A payload that is neither the expected magic NOR base64-of-it must pass
    # through unchanged (downstream validation/engine then rejects genuine junk):
    # the peel must never corrupt a legitimately single-encoded body.
    junk = b"not a pdf and not base64-of-one"
    assert function_app._peel_double_base64(junk, function_app._looks_like_pdf) == junk


def test_looks_like_supported_image_recognises_magics():
    # The plate-route magic-byte authority lives in plate_adapter; spot-check the
    # formats the connector advertises so the tolerant decode sniffs them correctly.
    assert plate_adapter.looks_like_supported_image(b"\xff\xd8\xff rest")           # jpeg
    assert plate_adapter.looks_like_supported_image(b"\x89PNG\r\n\x1a\n rest")      # png
    assert plate_adapter.looks_like_supported_image(b"BM bitmap")                   # bmp
    assert plate_adapter.looks_like_supported_image(b"II*\x00 tiff")               # tiff (LE)
    assert plate_adapter.looks_like_supported_image(b"RIFF\x00\x00\x00\x00WEBPVP8 ")  # webp
    assert plate_adapter.looks_like_supported_image(b"\x00\x00\x00\x18ftypheic...")   # heic
    assert not plate_adapter.looks_like_supported_image(b"%PDF-1.4")               # a PDF is not an image
    assert not plate_adapter.looks_like_supported_image(b"random bytes")
