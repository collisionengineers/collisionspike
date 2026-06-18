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

  EVA fields the parser does NOT yet emit (defaulted to empty string here,
  to be filled by enrichment / staff downstream):
    claimant_telephone, claimant_email

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

import os
import tempfile
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
# it. Keys absent from this map are EVA fields the parser does not yet produce
# (claimant_telephone, claimant_email) and default empty.
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

# Case-identity parser keys surfaced separately (NEVER in the EVA payload).
CASE_IDENTITY_PARSER_KEYS: tuple[str, ...] = ("vrm", "reference")

# Stamped onto the response so consumers can pin parser/contract drift.
CONTRACT_VERSION = "cedocumentparser_v2.0_eva_json"

# Supported source suffixes (mirrors readers.get_reader_for_path dispatch).
_SUPPORTED_SUFFIXES = (".pdf", ".docx", ".doc", ".eml", ".msg")


class ParserError(RuntimeError):
    """Raised when the underlying parser fails to read/extract a document.

    The HTTP handler maps this to a 502 (the parser is an upstream dependency).
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
    try:
        from cedocumentmapper_v2.application import DocumentMapperService
    except Exception as exc:  # pragma: no cover - exercised only with deps absent
        raise ParserError(f"cedocumentmapper_v2 is not importable: {exc}") from exc

    tmp_path: str | None = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as fh:
            fh.write(document_bytes)

        service = DocumentMapperService()
        # provider_hint maps onto the sibling's provider_selector (id or name).
        _document, record = service.process_document(tmp_path, provider_selector=provider_hint)
        return service.record_to_dict(record)
    except ParserError:
        raise
    except Exception as exc:
        raise ParserError(f"parser failed for {filename!r}: {exc}") from exc
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:  # pragma: no cover - best-effort cleanup
                pass


def to_eva_extraction(parser_result: dict[str, Any]) -> dict[str, Any]:
    """Map a ``record_to_dict`` result -> the 12-field EVA extraction + identity.

    Returns:
        {
          "extraction": { <12 EVA keys in order>: {value, confidence, source,
                          warnings?}, ... },
          "vrm":       {value, confidence, source, warnings?} | None,
          "reference": {value, confidence, source, warnings?} | None,
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
            # EVA field the parser does not supply (or supplied no row):
            # present but empty so the payload always has exactly 13 keys.
            extraction[eva_key] = {"value": "", "confidence": None, "source": "absent"}

    vrm = _to_field_cell(fields["vrm"]) if "vrm" in fields else None
    reference = _to_field_cell(fields["reference"]) if "reference" in fields else None

    issues = list((parser_result or {}).get("issues", []) or [])

    return {
        "extraction": extraction,
        "vrm": vrm,
        "reference": reference,
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
