"""ocr_pdf_adapter — the ONLY seam for OCRing an image-only PDF.

This is the single place the OCR host touches heavy OCR deps (PyMuPDF / Tesseract
/ the optional vendored `cedocumentmapper_v2` engine / the Document Intelligence
Read client). Everything else in the host speaks the settled envelope and never
imports those directly. Mirrors the parser's `parser_adapter.py` seam so that:

* tests monkeypatch ``run_ocr`` to return a fixture WITHOUT any OCR dep installed, and
* swapping the doc-OCR engine (Tesseract <-> Document Intelligence Read) is a
  one-file change behind the ``provider`` argument.

------------------------------------------------------------------------------
Two engines, one switch (``OCR_PROVIDER`` -> ``provider`` here):

  provider="tesseract" (default)  the in-container Tesseract binary. This is the
      whole point of the container: the engine's OCR fallback
      (`readers/pdf.py::should_ocr` -> `pytesseract.image_to_string`) is already
      written + tested and fires automatically once `shutil.which("tesseract")`
      resolves — which it does in the image but never on FC1. ZERO engine edit.

  provider="docintel"             Azure AI Document Intelligence Read
      (`prebuilt-read`, GA 2024-11-30). The managed fallback for when Tesseract
      accuracy on real provider scans disappoints. We render each page to PNG
      with PyMuPDF and POST it to DI Read (async analyze -> poll -> text). DI
      Read is called SERVER-SIDE here (Function -> DI Read over HTTPS, key from a
      Key Vault reference app setting); the Code App/flows only ever see OUR
      connector (CSP-safe), never DI Read. Image Analysis 4.0 is DEPRECATED
      (retires 2028-09-25) — DI Read is the managed survivor (plans/ocr-strategy §0).

------------------------------------------------------------------------------
Two output modes:

  * **Engine present** (vendored `cedocumentmapper_v2` in the image): we run the
    SAME `DocumentMapperService.process_document` the parser uses, so an
    image-only PDF returns the full 12-field EVA extraction (because Tesseract is
    now present, the engine's OCR branch produces text, then its rules/normalisers
    map the fields). The output is then projected onto the parser's exact envelope
    via `_to_eva_extraction` — identical to the FC1 parser's response shape.

  * **Engine absent** (`provider="docintel"` with no vendored engine, or a lean
    image): we return raw OCR ``ocr_text`` + ``page_count`` only, with
    ``extraction=None``. The caller (parser Function) can then run its own
    rules over the returned text, OR persist the text for staff review.

Either way ``contract_version`` upstream stays ``ce_ocr_v1`` (set by the handler).
"""

from __future__ import annotations

import io
import json
import os
import tempfile
from pathlib import Path
from typing import Any

# The 12 EVA payload keys in contract order + the parser->EVA rename map, kept
# BYTE-IDENTICAL to functions/parser/parser_adapter.py so the OCR host's
# extraction envelope is indistinguishable from the FC1 parser's. (If the parser
# map changes, change it here too — they are the same contract.)
EVA_FIELD_ORDER: tuple[str, ...] = (
    "work_provider",
    "vehicle_model",
    "claimant_name",
    "claimant_telephone",
    "claimant_email",
    "date_of_loss",
    "date_of_instruction",
    "accident_circumstances",
    "inspection_address",
    "vat_status",
    "mileage",
    "mileage_unit",
)

EVA_KEY_FROM_PARSER_KEY: dict[str, str] = {
    "work_provider": "work_provider",
    "vehicle_model": "vehicle_model",
    "claimant_name": "claimant_name",
    "date_of_loss": "incident_date",
    "date_of_instruction": "instruction_date",
    "accident_circumstances": "accident_circumstances",
    "inspection_address": "inspection_address",
    "vat_status": "vat_status",
    "mileage": "mileage",
    "mileage_unit": "mileage_unit",
}

# Render DPI for page->image rasterisation (matches the engine's OCR fallback:
# readers/pdf.py uses fitz.Matrix(300/72, 300/72)).
_RENDER_DPI = 300

# Cap pages sent to OCR (mirrors the engine's OCR_PAGE_LIMIT default; an image-only
# instruction is ~1-2 pages). Overridable via OCR_PAGE_LIMIT for long scans.
_DEFAULT_PAGE_LIMIT = 2

# Per-worker writable scratch dir for the optional vendored engine's catalogue
# (same construction as the parser's parser_adapter, FC1/container-safe).
_SERVICE_APP_DATA_DIR = Path(tempfile.gettempdir()) / "ce_ocr_appdata"


class OcrError(RuntimeError):
    """Raised when OCR of a document fails. The handler maps this to a 502."""


def run_ocr(
    document_bytes: bytes,
    filename: str,
    *,
    provider: str = "tesseract",
    provider_hint: str | None = None,
) -> dict[str, Any]:
    """OCR an image-only PDF and return an envelope fragment.

    Returns a dict with keys: ``extraction`` (dict|None), ``vrm`` (cell|None),
    ``reference`` (cell|None), ``ocr_text`` (str), ``page_count`` (int),
    ``issues`` (list). The HTTP handler stamps ``ocr_provider`` /
    ``contract_version`` and serialises.

    This is the single function tests monkeypatch. All heavy imports are LAZY
    (inside the function body) so importing this module — and running the test
    suite — needs neither PyMuPDF, Tesseract, the vendored engine, nor an HTTP
    client.
    """
    provider = (provider or "tesseract").strip().lower()

    # Prefer the FULL engine path when the engine is vendored alongside (gives the
    # 12-field extraction directly). For provider="tesseract" this is the
    # zero-edit primary path. For provider="docintel" we still try the engine but
    # with the DI-Read OCR hook installed (see _run_engine).
    if _engine_available():
        return _run_engine(document_bytes, filename, provider=provider, provider_hint=provider_hint)

    # No vendored engine in this image: produce raw OCR text only.
    text, pages = _ocr_to_text(document_bytes, provider=provider)
    issues: list[dict[str, Any]] = []
    if not text:
        issues.append(
            {
                "field": "(ocr)",
                "severity": "warning",
                "code": "ocr_empty",
                "message": "OCR produced no text from the document.",
            }
        )
    return {
        "extraction": None,
        "vrm": None,
        "reference": None,
        "ocr_text": text,
        "page_count": pages,
        "issues": issues,
    }


# --------------------------------------------------------------------------- #
# Full-engine path (vendored cedocumentmapper_v2 present)                       #
# --------------------------------------------------------------------------- #
def _engine_available() -> bool:
    """True when the vendored parser engine is importable in this image."""
    try:
        import cedocumentmapper_v2  # noqa: F401
        return True
    except Exception:
        return False


def _run_engine(
    document_bytes: bytes,
    filename: str,
    *,
    provider: str,
    provider_hint: str | None,
) -> dict[str, Any]:
    """Run the vendored engine over the bytes; project to the EVA envelope.

    For provider="docintel" we monkeypatch the engine reader's per-page OCR call
    to use Document Intelligence Read instead of pytesseract, WITHOUT editing the
    vendored engine source (we set the attribute at runtime). For "tesseract" the
    engine runs unmodified and uses the in-container binary.
    """
    suffix = ".pdf"
    tmp_path: str | None = None
    try:
        from cedocumentmapper_v2.application import DocumentMapperService
    except Exception as exc:  # pragma: no cover - only when engine half-present
        raise OcrError(f"cedocumentmapper_v2 is not importable: {exc}") from exc

    # Install the DI-Read OCR hook on the PDF reader module if requested. This is
    # a RUNTIME monkeypatch of pytesseract.image_to_string as seen by the reader,
    # so no vendored source changes. Restored in `finally`.
    restore = None
    if provider == "docintel":
        restore = _install_docintel_ocr_hook()

    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as fh:
            fh.write(document_bytes)

        _SERVICE_APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        seed = _vendored_providers_seed()
        kwargs: dict[str, Any] = {"app_data_dir": _SERVICE_APP_DATA_DIR}
        if seed is not None:
            kwargs["seed_path"] = seed
        service = DocumentMapperService(**kwargs)
        document, record = service.process_document(tmp_path, provider_selector=provider_hint)
        parser_result = service.record_to_dict(record)

        mapped = _to_eva_extraction(parser_result)
        ocr_text = getattr(document, "plain_text", "") or ""
        page_count = len(getattr(document, "pages", ()) or ())
        mapped["ocr_text"] = ocr_text
        mapped["page_count"] = page_count
        return mapped
    except OcrError:
        raise
    except Exception as exc:
        raise OcrError(f"engine OCR failed for {filename!r}: {exc}") from exc
    finally:
        if restore is not None:
            restore()
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:  # pragma: no cover
                pass


def _vendored_providers_seed() -> Path | None:
    """Return the vendored providers.json path if the engine is vendored here."""
    candidate = Path(__file__).resolve().parent / "cedocumentmapper_v2" / "providers.json"
    return candidate if candidate.exists() else None


def _install_docintel_ocr_hook():
    """Point the engine PDF reader's ``pytesseract.image_to_string`` at DI Read.

    Returns a zero-arg restore callable. The engine renders each page to a PIL
    image and calls ``pytesseract.image_to_string(img, lang=...)``; by replacing
    that callable at runtime we route the SAME rendered page through DI Read with
    no vendored-source edit. If the reader module / pytesseract is not importable
    we no-op (the engine will then use whatever OCR it has).
    """
    try:
        import pytesseract  # type: ignore
    except Exception:  # pragma: no cover
        return lambda: None

    original = getattr(pytesseract, "image_to_string", None)

    def _di_read_image(img, *args, **kwargs) -> str:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return docintel_read_bytes(buf.getvalue(), content_type="image/png")

    try:
        pytesseract.image_to_string = _di_read_image  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover
        return lambda: None

    def _restore() -> None:
        try:
            if original is not None:
                pytesseract.image_to_string = original  # type: ignore[attr-defined]
        except Exception:  # pragma: no cover
            pass

    return _restore


# --------------------------------------------------------------------------- #
# Raw-text path (no vendored engine) — render + OCR per provider                #
# --------------------------------------------------------------------------- #
def _ocr_to_text(document_bytes: bytes, *, provider: str) -> tuple[str, int]:
    """Render the PDF to page images and OCR them to a single text string.

    Returns (text, page_count). Lazy-imports PyMuPDF + the chosen OCR engine.
    """
    try:
        import fitz  # PyMuPDF  # type: ignore
    except Exception as exc:  # pragma: no cover - only with PyMuPDF absent
        raise OcrError(f"PyMuPDF (fitz) is not importable: {exc}") from exc

    page_limit = _page_limit()
    parts: list[str] = []
    page_count = 0
    try:
        doc = fitz.open(stream=document_bytes, filetype="pdf")
    except Exception as exc:
        raise OcrError(f"could not open PDF: {exc}") from exc

    try:
        page_count = doc.page_count
        for page_idx in range(min(page_count, page_limit)):
            page = doc[page_idx]
            pix = page.get_pixmap(matrix=fitz.Matrix(_RENDER_DPI / 72, _RENDER_DPI / 72))
            png = pix.tobytes("png")
            if provider == "docintel":
                parts.append(docintel_read_bytes(png, content_type="image/png"))
            else:
                parts.append(_tesseract_png(png))
    finally:
        doc.close()

    return ("\n\n".join(p for p in parts if p).strip(), page_count)


def _tesseract_png(png_bytes: bytes) -> str:
    """OCR a PNG with the in-container Tesseract binary via pytesseract."""
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise OcrError(f"pytesseract/Pillow not importable: {exc}") from exc
    img = Image.open(io.BytesIO(png_bytes))
    return pytesseract.image_to_string(img, lang="eng") or ""


# --------------------------------------------------------------------------- #
# Document Intelligence Read (managed fallback) — server-side HTTPS call        #
# --------------------------------------------------------------------------- #
def docintel_read_bytes(content: bytes, *, content_type: str = "application/pdf") -> str:
    """Run Azure AI Document Intelligence Read (`prebuilt-read`) over bytes -> text.

    Uses the GA 2024-11-30 async pattern: POST :analyze (202 + Operation-Location),
    poll the GET until ``status == "succeeded"``, then concatenate the read lines.
    Endpoint + key come from app settings DOCINTEL_ENDPOINT / DOCINTEL_KEY (the
    key is a Key Vault reference resolved by the container's managed identity — no
    literal secret anywhere). Raises OcrError if not configured or on failure.

    Docs: learn.microsoft.com/azure/ai-services/document-intelligence — Read model,
    REST API v4.0 (2024-11-30): analyze -> Operation-Location -> poll.
    """
    import time

    try:
        import requests  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise OcrError(f"requests not importable for DI Read: {exc}") from exc

    endpoint = (os.environ.get("DOCINTEL_ENDPOINT") or "").rstrip("/")
    key = os.environ.get("DOCINTEL_KEY") or ""
    if not endpoint or not key:
        raise OcrError(
            "OCR_PROVIDER=docintel but DOCINTEL_ENDPOINT/DOCINTEL_KEY are not configured."
        )
    api_version = os.environ.get("DOCINTEL_API_VERSION") or "2024-11-30"
    analyze_url = (
        f"{endpoint}/documentintelligence/documentModels/prebuilt-read:analyze"
        f"?_overload=analyzeDocument&api-version={api_version}"
    )
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": content_type,
    }
    try:
        resp = requests.post(analyze_url, headers=headers, data=content, timeout=60)
        if resp.status_code != 202:
            raise OcrError(f"DI Read analyze returned {resp.status_code}: {resp.text[:200]}")
        op_location = resp.headers.get("Operation-Location") or resp.headers.get("operation-location")
        if not op_location:
            raise OcrError("DI Read analyze response missing Operation-Location header.")

        # Poll. DI recommends >= 1s between calls; cap total wait.
        deadline = time.monotonic() + 120
        while True:
            poll = requests.get(op_location, headers={"Ocp-Apim-Subscription-Key": key}, timeout=60)
            data = poll.json()
            status = (data.get("status") or "").lower()
            if status == "succeeded":
                return _di_read_text(data)
            if status == "failed":
                raise OcrError(f"DI Read analyze failed: {json.dumps(data.get('error', {}))[:200]}")
            if time.monotonic() > deadline:
                raise OcrError("DI Read analyze timed out.")
            time.sleep(1.0)
    except OcrError:
        raise
    except Exception as exc:
        raise OcrError(f"DI Read call failed: {exc}") from exc


def _di_read_text(analyze_result: dict[str, Any]) -> str:
    """Extract the concatenated page text from a DI Read analyze result JSON."""
    result = analyze_result.get("analyzeResult") or {}
    # Prefer the top-level 'content' (full text in reading order).
    content = result.get("content")
    if isinstance(content, str) and content.strip():
        return content
    # Fallback: stitch per-page lines.
    parts: list[str] = []
    for page in result.get("pages") or []:
        for line in page.get("lines") or []:
            txt = line.get("content")
            if txt:
                parts.append(txt)
    return "\n".join(parts).strip()


# --------------------------------------------------------------------------- #
# Envelope projection (identical to functions/parser/parser_adapter.py)         #
# --------------------------------------------------------------------------- #
def _to_eva_extraction(parser_result: dict[str, Any]) -> dict[str, Any]:
    """Map a ``record_to_dict`` result -> the 12-field EVA extraction + identity."""
    fields: dict[str, Any] = (parser_result or {}).get("fields", {}) or {}

    extraction: dict[str, Any] = {}
    for eva_key in EVA_FIELD_ORDER:
        parser_key = EVA_KEY_FROM_PARSER_KEY.get(eva_key)
        if parser_key is not None and parser_key in fields:
            extraction[eva_key] = _to_field_cell(fields[parser_key])
        else:
            extraction[eva_key] = {"value": "", "confidence": None, "source": "absent"}

    vrm = _to_field_cell(fields["vrm"]) if "vrm" in fields else None
    reference = _to_field_cell(fields["reference"]) if "reference" in fields else None
    issues = list((parser_result or {}).get("issues", []) or [])

    return {"extraction": extraction, "vrm": vrm, "reference": reference, "issues": issues}


def _to_field_cell(field: dict[str, Any]) -> dict[str, Any]:
    """Project a parser field dict into the {value, confidence, source, warnings?} cell."""
    cell: dict[str, Any] = {
        "value": str(field.get("value", "") or ""),
        "confidence": field.get("confidence"),
        "source": field.get("rule_id") or "ocr_extraction",
    }
    warnings = [
        issue.get("message", "")
        for issue in (field.get("issues") or [])
        if issue.get("message")
    ]
    if warnings:
        cell["warnings"] = warnings
    return cell


def _page_limit() -> int:
    raw = os.environ.get("OCR_PAGE_LIMIT")
    if raw:
        try:
            n = int(raw)
            if n > 0:
                return n
        except ValueError:
            pass
    return _DEFAULT_PAGE_LIMIT
