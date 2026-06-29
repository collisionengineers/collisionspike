"""parser_adapter — the ONLY seam to the sibling ``cedocumentmapper_v2`` package.

This module is the single place where the Collision Engineers parser Function
touches ``cedocumentmapper_v2``. Everything else in this Function (the HTTP
handler, schema validation) speaks the settled 12-field EVA contract and never
imports the sibling package directly. Keeping the coupling in one file means:

* tests can monkeypatch ``run_parser`` to return a fixture extraction WITHOUT
  the heavy parser deps (PyMuPDF / Tesseract / python-docx) installed, and
* a future change to the sibling API is a one-file edit here.

------------------------------------------------------------------------------
The exact sibling API this adapter targets (confirmed by reading the source on
2026-06-17 — ``src/cedocumentmapper_v2/application/service.py`` +
``domain/models.py``):

    from cedocumentmapper_v2.application import DocumentMapperService

    svc = DocumentMapperService()
    document, record = svc.process_document(path)        # path = str | Path
    payload = svc.record_to_dict(record)                 # -> dict (below)

``DocumentMapperService.process_document(path, provider_selector=None,
engineer_report=None)`` returns ``tuple[DocumentModel, ExtractedRecord]``. It
dispatches a reader by FILE-SUFFIX (``readers.get_reader_for_path`` — .pdf /
.docx / .doc / .eml / .msg), so the adapter must persist the decoded bytes to a
temp file carrying the real extension before calling it. There is currently no
bytes-in public entry point; if the document-parser-engineer adds one
(e.g. ``process_bytes(data, filename)``) this adapter is where it plugs in.

``record_to_dict(record)`` yields:

    {
      "provider": {"provider_id", "provider_name", "confidence", ...},
      "fields": {
        "<field_key>": {
          "value": str, "raw_value": str, "rule_id": str|None,
          "confidence": float|None, "source_span": {...}|None,
          "issues": [{"field","severity","code","message"}, ...],
        }, ...
      },
      "issues": [{"field","severity","code","message"}, ...],
    }

------------------------------------------------------------------------------
CONTRACT MISMATCH (deliberate; this adapter reconciles it).

The sibling parser's native field set (``domain/models.FieldKey``) is the
LEGACY set and is NOT the settled EVA 12. The differences this adapter bridges:

  parser native key        -> EVA contract key            note
  -----------------------     ------------------            ----
  work_provider            -> work_provider               same
  vehicle_model            -> vehicle_model               same
  claimant_name            -> claimant_name               same
  incident_date            -> date_of_loss                RENAMED
  instruction_date         -> date_of_instruction         RENAMED
  inspection_address       -> inspection_address          same
  accident_circumstances   -> accident_circumstances      same
  vat_status               -> vat_status                  same
  mileage                  -> mileage                     same
  mileage_unit             -> mileage_unit                same
  vrm                      -> (Case-identity)             NOT in EVA payload
  reference                -> (Case-identity)             NOT in EVA payload
  inspection_date          -> (dropped from EVA payload)  not an EVA field

  claimant_telephone       -> claimant_telephone         same (ROADMAP B2)
  claimant_email           -> claimant_email             same (ROADMAP B2)

  As of ROADMAP B2 the parser emits claimant_telephone / claimant_email
  NATIVELY (UK phone + email regex scoped to claimant/insured context, with
  provenance). They map identity. When the document text has no derivable
  number/address they stay EMPTY for staff to fill — never invented.

  (Engineer allocation is NOT an EVA submission field — it is left blank and
  assigned inside EVA AFTER submission, so it is excluded from the contract.)

``vrm`` and ``reference`` are surfaced SEPARATELY (Case-identity, for 5.3
correlation/dedup) and are intentionally excluded from the 12-field payload.

OPEN ITEM to confirm with document-parser-engineer:
  * Whether the sibling will rename its native keys to the EVA set (which would
    let the rename map below collapse to identity), or add the two missing
    EVA fields, or expose a bytes-in entry point. Until then this adapter is the
    authoritative reconciliation and the rename map is the contract.
"""

from __future__ import annotations

import base64
import hashlib
import os
import tempfile
from pathlib import Path
from typing import Any

# The settled 12 EVA payload keys, in contract order. Mirrors
# contracts/eva-payload.schema.json and mockup-app/src/contracts/eva-export.ts
# EVA_FIELD_ORDER. (Engineer allocation is NOT an EVA submission field — it is
# left blank and assigned inside EVA after submission, so it is excluded.)
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

# Map an EVA contract key -> the sibling parser's native field key that supplies
# it. The parser now also emits claimant_telephone / claimant_email natively
# (ROADMAP B2 — derived from document text near claimant/insured context, left
# empty when absent). Both map identity. Any EVA key absent from this map (none
# today) would default empty in to_eva_extraction.
EVA_KEY_FROM_PARSER_KEY: dict[str, str] = {
    "work_provider": "work_provider",
    "vehicle_model": "vehicle_model",
    "claimant_name": "claimant_name",
    "claimant_telephone": "claimant_telephone",
    "claimant_email": "claimant_email",
    "date_of_loss": "incident_date",
    "date_of_instruction": "instruction_date",
    "accident_circumstances": "accident_circumstances",
    "inspection_address": "inspection_address",
    "vat_status": "vat_status",
    "mileage": "mileage",
    "mileage_unit": "mileage_unit",
}

# Case-identity parser keys surfaced separately (NEVER in the EVA payload).
CASE_IDENTITY_PARSER_KEYS: tuple[str, ...] = ("vrm", "reference")

# Stamped onto the response so consumers can pin parser/contract drift.
CONTRACT_VERSION = "cedocumentparser_v2.0_eva_json"

# Supported source suffixes (mirrors readers.get_reader_for_path dispatch).
_SUPPORTED_SUFFIXES = (".pdf", ".docx", ".doc", ".eml", ".msg")

# The engine is VENDORED next to this file as ``./cedocumentmapper_v2/`` (a
# top-level package on the worker's sys.path). Its provider catalogue ships
# inside that package as ``cedocumentmapper_v2/providers.json``. We pin the
# service to that seed and to a WRITABLE app-data dir so the headless Linux
# worker never tries to write into ``~/CE Document Mapper`` (the desktop default,
# which is read-only / absent on Flex Consumption). This is a wrapper-side
# concern only — the vendored engine source is byte-for-byte the sibling repo.
_VENDORED_PROVIDERS_JSON = Path(__file__).resolve().parent / "cedocumentmapper_v2" / "providers.json"

# Per-worker writable scratch dir for the service's migrated provider catalogue.
# Lives under the OS temp root (always writable on FC1) and is reused across
# invocations on the same warm worker.
_SERVICE_APP_DATA_DIR = Path(tempfile.gettempdir()) / "cedocumentmapper_v2_appdata"


class ParserError(RuntimeError):
    """Raised when the parser DEPENDENCY itself fails (engine unavailable).

    This means a *server-side* fault: the ``cedocumentmapper_v2`` package is not
    importable, a required reader binary/library is missing (e.g. Tesseract /
    python-docx), or the engine raised an unexpected internal error. The HTTP
    handler maps this to a 502 — the parser is an upstream dependency and the
    caller cannot fix it by changing the request.

    NB: a document the engine simply *cannot read* (corrupt / truncated / not a
    real PDF) is NOT this — that is bad client input and raises
    ``DocumentUnreadableError`` (-> 422) instead. Conflating the two is what
    turned routine bad attachments into retried 502s.
    """


class DocumentUnreadableError(ValueError):
    """Raised when the engine cannot read/parse the SUPPLIED document.

    This is a CLIENT-side problem: the bytes are corrupt, truncated, empty of
    page objects, password-protected, or otherwise not a parseable document of
    the claimed type. It is the expected outcome for a junk attachment and MUST
    NOT be treated as a server failure. The HTTP handler maps this to 422
    (Unprocessable Entity) so the Power Automate flow routes the case to
    needs_review rather than retrying a 5xx.

    Subclasses ``ValueError`` so any caller that only distinguishes
    client-vs-server via ``ValueError`` still classifies it correctly.
    """


def run_parser(document_bytes: bytes, filename: str, provider_hint: str | None = None) -> dict[str, Any]:
    """Run the sibling parser over decoded bytes and return ``record_to_dict``.

    This is the single function tests monkeypatch. It imports the heavy sibling
    package LAZILY (inside the function body) so that importing
    ``parser_adapter`` — and therefore running the test suite — needs neither
    ``cedocumentmapper_v2`` nor PyMuPDF/Tesseract installed.

    Persists ``document_bytes`` to a temp file whose suffix is taken from
    ``filename`` (the sibling dispatches its reader by suffix), runs
    ``process_document``, and returns the ``record_to_dict`` mapping. ``filename``
    must carry a supported extension.
    """
    suffix = _suffix_for(filename)

    # Lazy import: kept OUT of module scope so tests can patch run_parser /
    # to_eva_extraction without the parser (or PyMuPDF/Tesseract) installed.
    # The reader-error hierarchy is imported alongside so we can tell a document
    # the engine *can't read* (client 422) apart from the engine being *broken*
    # (server 502). A missing reader dependency is a server fault and stays 502.
    try:
        from cedocumentmapper_v2.application import DocumentMapperService
        from cedocumentmapper_v2.readers.errors import (
            DependencyMissingError,
            ReaderError,
        )
    except Exception as exc:  # pragma: no cover - exercised only with deps absent
        raise ParserError(f"cedocumentmapper_v2 is not importable: {exc}") from exc

    tmp_path: str | None = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as fh:
            fh.write(document_bytes)

        # Pin the service to a writable app-data dir + the vendored provider
        # seed. Passing app_data_dir explicitly also disables the desktop
        # seed-merge-write-back, so the only write is the one-time schema
        # migration into our temp dir — never into the read-only home dir.
        _SERVICE_APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        service = DocumentMapperService(
            app_data_dir=_SERVICE_APP_DATA_DIR,
            seed_path=_VENDORED_PROVIDERS_JSON,
        )
        # provider_hint maps onto the sibling's provider_selector (id or name).
        _document, record = service.process_document(tmp_path, provider_selector=provider_hint)
        return service.record_to_dict(record)
    except ParserError:
        raise
    except DependencyMissingError as exc:
        # A reader's external library/binary is absent on the worker (e.g. the
        # OCR engine). That is a server-side provisioning fault, not bad input.
        raise ParserError(f"parser dependency missing for {filename!r}: {exc}") from exc
    except ReaderError as exc:
        # The engine opened the file but could not read/parse it: corrupt,
        # truncated, empty of objects, password-protected, or not really the
        # claimed type. This is a CLIENT problem -> 422, never a 502.
        raise DocumentUnreadableError(
            f"document {filename!r} could not be read: {exc}"
        ) from exc
    except Exception as exc:
        raise ParserError(f"parser failed for {filename!r}: {exc}") from exc
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:  # pragma: no cover - best-effort cleanup
                pass


# Source suffixes the engine's image extractor understands (PDF embeds, DOCX/DOC media).
_IMAGE_SOURCE_SUFFIXES = (".pdf", ".docx", ".doc")


def run_image_extraction(document_bytes: bytes, filename: str) -> dict[str, Any]:
    """Extract embedded images from an instruction document and return their BYTES.

    Wraps the vendored engine's ``DocumentMapperService.extract_images`` (PyMuPDF
    first, ``pypdf`` fallback for PDFs; word/media for DOCX/DOC). The engine writes
    extracted images to a local folder (a desktop-tooling concern); here we point it
    at a throwaway temp dir, read each file back, compute a sha256, and return the
    bytes base64-encoded with stable metadata — so the orchestration can persist each
    image as evidence in Blob + Postgres (pdf-image-extraction ticket).

    The engine is unmodified (no drift): this is a Function-layer wrapper, exactly
    like ``run_parser``. Returns ``{count, images: [{filename, ext, content_type,
    size, sha256, content_base64, sequence_index}], message}``. An unreadable / image-
    free document yields ``count: 0`` (never an exception) — the caller treats that as
    "nothing to extract", not a failure.
    """
    suffix = os.path.splitext(filename)[1].lower()
    if suffix not in _IMAGE_SOURCE_SUFFIXES:
        return {"count": 0, "images": [], "message": f"image extraction unsupported for {suffix!r}"}

    try:
        from cedocumentmapper_v2.application import DocumentMapperService
    except Exception as exc:  # pragma: no cover - exercised only with deps absent
        raise ParserError(f"cedocumentmapper_v2 is not importable: {exc}") from exc

    _SERVICE_APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    service = DocumentMapperService(
        app_data_dir=_SERVICE_APP_DATA_DIR, seed_path=_VENDORED_PROVIDERS_JSON
    )
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp) / "extracted"
        # fields={} -> the engine uses generic stems; out_dir set -> NO desktop write.
        result = service.extract_images(document_bytes, filename, fields={}, out_dir=out_dir)
        images: list[dict[str, Any]] = []
        for idx, path_str in enumerate(result.get("paths", []) or [], start=1):
            p = Path(path_str)
            try:
                data = p.read_bytes()
            except OSError:
                continue
            ext = p.suffix.lstrip(".").lower() or "bin"
            images.append(
                {
                    "filename": p.name,
                    "ext": ext,
                    "content_type": _IMAGE_CONTENT_TYPES.get(ext, "application/octet-stream"),
                    "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "content_base64": base64.b64encode(data).decode("ascii"),
                    "sequence_index": idx,
                }
            )
    return {
        "count": len(images),
        "images": images,
        "message": result.get("message", ""),
        "source": filename,
    }


# Map an extracted-image extension to a content type (EVA only consumes raster photos).
_IMAGE_CONTENT_TYPES: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "webp": "image/webp",
    "emf": "image/emf",
    "wmf": "image/wmf",
}


def to_eva_extraction(parser_result: dict[str, Any]) -> dict[str, Any]:
    """Map a ``record_to_dict`` result -> the 12-field EVA extraction + identity.

    Returns:
        {
          "extraction": { <12 EVA keys in order>: {value, confidence, source,
                          warnings?}, ... },
          "vrm":       {value, confidence, source, warnings?} | None,
          "reference": {value, confidence, source, warnings?} | None,
          "audit":     {value: bool, signals: [...], source} (audit case-type),
          "issues":    [ {field, severity, code, message}, ... ],
        }

    The ``extraction`` dict is built by iterating EVA_FIELD_ORDER so the 12 keys
    are always present and in contract order. Fields the parser does not emit
    become empty values with source ``"absent"``.
    """
    fields: dict[str, Any] = (parser_result or {}).get("fields", {}) or {}

    extraction: dict[str, Any] = {}
    for eva_key in EVA_FIELD_ORDER:
        parser_key = EVA_KEY_FROM_PARSER_KEY.get(eva_key)
        if parser_key is not None and parser_key in fields:
            extraction[eva_key] = _to_field_cell(fields[parser_key])
        else:
            # EVA field the parser did not supply a row for (e.g. an empty
            # claimant_telephone/claimant_email the engine omitted): present but
            # empty so the payload always has exactly the 12 EVA keys, in order.
            extraction[eva_key] = {"value": "", "confidence": None, "source": "absent"}

    vrm = _to_field_cell(fields["vrm"]) if "vrm" in fields else None
    reference = _to_field_cell(fields["reference"]) if "reference" in fields else None

    # Audit case-type signal — surfaced SEPARATELY (like vrm/reference), NEVER in
    # the 12-field EVA payload. Content-derived by the engine
    # (rules.engine.detect_audit_signals); always present so the envelope shape is
    # stable; ``signals`` explains the decision (auditable / Action-Logged).
    is_audit = bool((parser_result or {}).get("is_audit"))
    audit_signals = list((parser_result or {}).get("audit_signals", []) or [])
    audit = {"value": is_audit, "signals": audit_signals, "source": "instruction_text"}

    issues = list((parser_result or {}).get("issues", []) or [])

    return {
        "extraction": extraction,
        "vrm": vrm,
        "reference": reference,
        "audit": audit,
        "issues": issues,
    }


def _to_field_cell(field: dict[str, Any]) -> dict[str, Any]:
    """Project a parser field dict into the {value, confidence, source, warnings?} cell."""
    cell: dict[str, Any] = {
        "value": str(field.get("value", "") or ""),
        "confidence": field.get("confidence"),
        # rule_id identifies which extraction rule fired; it is the closest the
        # parser gives to a provenance "source". Fall back to "pdf_extraction".
        "source": field.get("rule_id") or "pdf_extraction",
    }
    warnings = [
        issue.get("message", "")
        for issue in (field.get("issues") or [])
        if issue.get("message")
    ]
    if warnings:
        cell["warnings"] = warnings
    return cell


def _suffix_for(filename: str) -> str:
    """Return the lower-cased, supported suffix of ``filename`` or raise ValueError."""
    if not filename:
        raise ValueError("filename is required to select a parser reader")
    _, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in _SUPPORTED_SUFFIXES:
        raise ValueError(
            f"unsupported document type {ext!r}; supported: {', '.join(_SUPPORTED_SUFFIXES)}"
        )
    return ext
