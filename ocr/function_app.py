"""function_app — Collision Engineers OCR host (Azure Functions Python v2).

The **OCR fallback host** (ROADMAP 5a / "B-full"). This is a SEPARATE Azure
Functions app from the live FC1 parser (`cespike-parser-dev-x7xt3d5ovhi7y`):
FC1 (Flex Consumption) runs a Microsoft-managed runtime and structurally
**cannot supply the `tesseract` binary**, so scanned / image-only PDFs degrade to
a no-op there. This host is built as a **container** (Azure Functions on Azure
Container Apps, scale-to-zero) so the one missing OS binary — `tesseract` — is
present, lighting up the engine's already-written, already-tested OCR fallback
with *zero engine-code change*. See plans/ocr-strategy.md.

It is invoked **only as a fallback**: the parser Function calls `/api/ocr-pdf`
only when its own text extraction yields ~no text (an image-only PDF). Text
PDFs / DOCX / DOC / EML / MSG keep running on FC1 untouched and never reach here.

Two HTTP routes (one container, one cold-start to amortise — plans/ocr-strategy §5):

    POST /api/ocr-pdf    image-only instruction PDF  -> OCR text (+ optional 12-field EVA
                         extraction when the vendored engine is present)
    POST /api/plate-ocr  overview vehicle photo      -> {plate_text, registration_visible,
                         vrm_match, ...} for the canonical image-rules contract

[BUILD] — authored OFFLINE; no Azure/tenant contact. Tests monkeypatch the two
adapter seams (`ocr_pdf_adapter.run_ocr` / `plate_adapter.read_plate`) so the
suite runs WITHOUT Tesseract, ONNX, `fast-alpr`, or PyMuPDF installed.

AUTH: FUNCTION-level (a function key is required) on both routes — defence in
depth behind the Power Platform custom connector, exactly like the parser. The
connector passes the key as the ``x-functions-key`` header (stored on the
connection, never in the connector definition). A request without a valid key
returns 401.

GATING: the Dataverse env-var gates ``OCR_SCANNED_PDF_ENABLED`` /
``PLATE_OCR_ENABLED`` are enforced UPSTREAM (the calling flow / Code App reads the
env var and only calls the route when enabled). This host does not read those
gates — it just works when called. ``OCR_PROVIDER`` (``tesseract`` | ``docintel``)
IS read here: it selects the document-OCR engine inside the container.

Doc-OCR response envelope (mirrors the parser envelope so callers parse one shape):
    {
      "extraction":       { <12 EVA keys>: {value, confidence, source, warnings?} } | null,
      "vrm":              {value, confidence, source, warnings?} | null,
      "reference":        {value, confidence, source, warnings?} | null,
      "ocr_text":         "<full recognised text>",
      "page_count":       int,
      "ocr_provider":     "tesseract" | "docintel",
      "issues":           [ {field, severity?, code, message} ],
      "contract_version": "ce_ocr_v1"
    }
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
from typing import Any

import azure.functions as func

import ocr_pdf_adapter
import plate_adapter
from ocr_pdf_adapter import OcrError
from plate_adapter import PlateOcrError

app = func.FunctionApp()

_LOG = logging.getLogger("ce.ocr")

CONTRACT_VERSION = "ce_ocr_v1"

# Supported raster image suffixes for the plate route (what fast-alpr / DI Read read).
_PLATE_SUFFIXES = (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".heif", ".heic", ".webp")


# --------------------------------------------------------------------------- #
# POST /api/ocr-pdf — scanned / image-only instruction PDF -> text (+EVA)       #
# --------------------------------------------------------------------------- #
@app.function_name(name="ocr_pdf")
@app.route(route="ocr-pdf", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def ocr_pdf(req: func.HttpRequest) -> func.HttpResponse:
    """POST /ocr-pdf — OCR an image-only PDF. See module docstring."""
    body, err = _json_body(req)
    if err is not None:
        return err

    document_b64 = body.get("document")
    filename = body.get("filename")
    provider_hint = body.get("provider_hint")

    if not document_b64 or not isinstance(document_b64, str):
        return _doc_error(400, "missing_document", "'document' (base64 string) is required.")
    if not filename or not isinstance(filename, str):
        return _doc_error(400, "missing_filename", "'filename' (string with extension) is required.")
    if not filename.lower().endswith(".pdf"):
        # This host's OCR path is for image-only PDFs only. Text docs stay on FC1.
        return _doc_error(
            400,
            "unsupported_document",
            "/ocr-pdf only accepts .pdf (image-only). Text documents are handled by the FC1 parser.",
        )
    if provider_hint is not None and not isinstance(provider_hint, str):
        return _doc_error(400, "bad_provider_hint", "'provider_hint' must be a string when provided.")

    try:
        document_bytes = base64.b64decode(document_b64, validate=True)
    except (binascii.Error, ValueError):
        return _doc_error(400, "bad_base64", "'document' is not valid base64.")
    if not document_bytes:
        return _doc_error(400, "empty_document", "Decoded 'document' is empty.")

    provider = _ocr_provider()
    try:
        result = ocr_pdf_adapter.run_ocr(
            document_bytes, filename, provider=provider, provider_hint=provider_hint
        )
    except OcrError as exc:
        _LOG.exception("ocr-pdf failed")
        return _doc_error(502, "ocr_failed", str(exc))

    # The adapter returns a dict already shaped to the envelope (extraction may be
    # None when the engine is absent and only raw text was produced).
    response: dict[str, Any] = {
        "extraction": result.get("extraction"),
        "vrm": result.get("vrm"),
        "reference": result.get("reference"),
        "ocr_text": result.get("ocr_text", ""),
        "page_count": result.get("page_count", 0),
        "ocr_provider": provider,
        "issues": list(result.get("issues", [])),
        "contract_version": CONTRACT_VERSION,
    }
    return _json(200, response)


# --------------------------------------------------------------------------- #
# POST /api/plate-ocr — overview vehicle photo -> registration / VRM-match      #
# --------------------------------------------------------------------------- #
@app.function_name(name="plate_ocr")
@app.route(route="plate-ocr", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def plate_ocr(req: func.HttpRequest) -> func.HttpResponse:
    """POST /plate-ocr — read a UK registration plate from a vehicle photo.

    M1 semantics (ADR-0009 / image-rules.ts): we only need the plate to be read
    well enough to (a) tick the canonical Evidence ``registrationVisible`` field
    and (b) VRM-match images to the open Case (ADR-0002 / ADR-0007). Role tagging
    (overview vs damage) and person/reflection detection stay M2 — NOT here.
    """
    body, err = _json_body(req, kind="plate")
    if err is not None:
        return err

    image_b64 = body.get("image")
    filename = body.get("filename")
    case_vrm = body.get("case_vrm")

    if not image_b64 or not isinstance(image_b64, str):
        return _plate_error(400, "missing_image", "'image' (base64 string) is required.")
    if not filename or not isinstance(filename, str):
        return _plate_error(400, "missing_filename", "'filename' (string with extension) is required.")
    if not filename.lower().endswith(_PLATE_SUFFIXES):
        return _plate_error(
            400,
            "unsupported_image",
            f"'filename' must be one of: {', '.join(_PLATE_SUFFIXES)}.",
        )
    if case_vrm is not None and not isinstance(case_vrm, str):
        return _plate_error(400, "bad_case_vrm", "'case_vrm' must be a string when provided.")

    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError):
        return _plate_error(400, "bad_base64", "'image' is not valid base64.")
    if not image_bytes:
        return _plate_error(400, "empty_image", "Decoded 'image' is empty.")

    provider = _plate_provider()
    try:
        result = plate_adapter.read_plate(
            image_bytes, filename, case_vrm=case_vrm, provider=provider
        )
    except PlateOcrError as exc:
        _LOG.exception("plate-ocr failed")
        return _plate_error(502, "plate_ocr_failed", str(exc))

    response: dict[str, Any] = {
        "plate_text": result.get("plate_text", ""),
        "confidence": result.get("confidence"),
        # `registration_visible` is what the flow / Code App writes to Evidence
        # `registrationVisible` (the field the overview image-rule consumes).
        "registration_visible": bool(result.get("registration_visible", False)),
        # `vrm_match` drives the ADR-0007 WhatsApp bulk-match / image-to-Case correlation.
        "vrm_match": result.get("vrm_match"),
        "raw_candidates": list(result.get("raw_candidates", [])),
        "plate_provider": provider,
        "issues": list(result.get("issues", [])),
        "contract_version": CONTRACT_VERSION,
    }
    return _json(200, response)


# --------------------------------------------------------------------------- #
# helpers                                                                      #
# --------------------------------------------------------------------------- #
def _ocr_provider() -> str:
    """Doc-OCR engine selector. ``tesseract`` (in-container, default) | ``docintel`` (DI Read)."""
    raw = (os.environ.get("OCR_PROVIDER") or "tesseract").strip().lower()
    return raw if raw in {"tesseract", "docintel"} else "tesseract"


def _plate_provider() -> str:
    """Plate engine selector. ``fast_alpr`` (in-container, default) | ``docintel`` (DI Read)."""
    raw = (os.environ.get("PLATE_PROVIDER") or "fast_alpr").strip().lower()
    return raw if raw in {"fast_alpr", "docintel"} else "fast_alpr"


def _json_body(req: func.HttpRequest, kind: str = "doc") -> tuple[dict[str, Any] | None, func.HttpResponse | None]:
    """Parse the request JSON object. Returns (body, None) or (None, error_response)."""
    try:
        body = req.get_json()
    except ValueError:
        err = _doc_error if kind == "doc" else _plate_error
        return None, err(400, "bad_request", "Request body must be valid JSON.")
    if not isinstance(body, dict):
        err = _doc_error if kind == "doc" else _plate_error
        return None, err(400, "bad_request", "Request body must be a JSON object.")
    return body, None


def _json(status: int, payload: dict[str, Any]) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )


def _doc_error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured doc-OCR error envelope (mirrors the success shape: one schema for callers)."""
    return _json(
        status,
        {
            "extraction": None,
            "vrm": None,
            "reference": None,
            "ocr_text": "",
            "page_count": 0,
            "ocr_provider": _ocr_provider(),
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": CONTRACT_VERSION,
        },
    )


def _plate_error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured plate-OCR error envelope."""
    return _json(
        status,
        {
            "plate_text": "",
            "confidence": None,
            "registration_visible": False,
            "vrm_match": None,
            "raw_candidates": [],
            "plate_provider": _plate_provider(),
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": CONTRACT_VERSION,
        },
    )
