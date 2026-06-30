"""function_app — Collision Engineers parser Function (Azure Functions Python v2).

HTTP trigger ``POST /parse``. Accepts a base64-encoded instruction document,
runs it through the sibling ``cedocumentmapper_v2`` parser (via parser_adapter,
the only seam), maps the result onto the settled 12-field snake_case EVA
contract with per-field ``{value, confidence, source, warnings?}``, surfaces
``vrm``/``reference`` SEPARATELY (Case-identity, NOT in the EVA payload),
validates the flat 12-field payload against ``contracts/eva-payload.schema.json``,
and returns a structured envelope.

[BUILD] — authored offline; no Azure/tenant contact (tests mock the parser seam).

AUTH: FUNCTION-level (a function key is required) for defence-in-depth — the
Power Platform custom connector / API gateway also fronts the endpoint, but the
host is never left open. The connector passes the key as the ``x-functions-key``
header. (See README "Auth boundary".)

GATING: ``PDF_MAPPER_ENABLED`` is enforced UPSTREAM, in the Power Automate flow
branch (the flow checks the Dataverse env var and only calls this route when
enabled). The Function just works when called; it does not read the gate.

Response envelope:
    {
      "extraction":       { <12 EVA keys in order>: {value, confidence, source, warnings?} },
      "vrm":              {value, confidence, source, warnings?} | null,
      "reference":        {value, confidence, source, warnings?} | null,
      "audit":            {value: bool, signals: [...], source} | null,
      "issues":           [ {field, severity?, code, message} ],
      "contract_version": "cedocumentparser_v2.0_eva_json"
    }

Status codes:
    200  parsed + schema-valid (or schema-invalid surfaced in issues, see below)
    400  bad request (missing/!base64 document, missing/unsupported filename, bad JSON)
    422  the document itself is unreadable (corrupt/truncated/not a real PDF/etc.) —
         a CLIENT problem the parser cannot fix; the flow routes the case to review
    500  unexpected internal error (defensive; should never escape as a raw 502)
    502  parser DEPENDENCY failed — engine not importable / reader binary missing
         (ParserError); a genuine server-side fault, safe for the flow to retry
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import re
from typing import Any

import azure.functions as func

import parser_adapter
from parser_adapter import DocumentUnreadableError, ParserError
from schema_validation import SchemaValidationError, validate_eva_payload
from cedocumentmapper_v2.rules.email_classifier import (
    classify_email,
    CONTRACT_VERSION as EMAIL_CONTRACT_VERSION,
)

app = func.FunctionApp()

_LOG = logging.getLogger("ce.parser")

CONTRACT_VERSION = parser_adapter.CONTRACT_VERSION

# Strip HTML tags + decode the common entities so the deterministic keyword / VRM
# scan runs over plain text whatever the V3 connector hands us (HTML or text
# body). Deliberately tiny + dependency-free: no bs4 on the FC1 worker.
_TAG_RE = re.compile(r"<[^>]+>")
_HTML_ENTITIES = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
}


def _strip_html(value: Any) -> str:
    """Server-side HTML-strip of an email body to plain text.

    Drops ``<style>``/``<script>`` blocks, replaces tags + ``<br>``/``</p>`` with
    whitespace, decodes the handful of entities that survive Outlook, and collapses
    runs of blank lines. Non-string input -> "".
    """
    if not isinstance(value, str) or not value:
        return ""
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", value)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", text)
    text = _TAG_RE.sub(" ", text)
    for entity, char in _HTML_ENTITIES.items():
        text = text.replace(entity, char)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

_DOC_MAGICS = (b"%PDF", b"PK\x03\x04", b"\xd0\xcf\x11\xe0", b"{\\rtf")
_STRICT_B64 = re.compile(rb"^[A-Za-z0-9+/]+={0,2}$")


def _has_doc_magic(b: bytes) -> bool:
    return any(b.startswith(m) for m in _DOC_MAGICS)


def _decode_document(document_b64: str) -> bytes:
    """Decode the request ``document`` (base64), tolerating a redundant 2nd layer.

    The Power Platform connector gateway intermittently re-encodes a base64
    ``document`` value (a ``format: byte``-class behaviour we could NOT reliably
    suppress — removing/recreating the connector definition did not stop it, and
    declaring ``format: byte`` made it worse). So a single decode sometimes yields
    the real bytes and sometimes yields the base64-ASCII OF the real bytes.

    We decode once; if the result is a known document (PDF/OOXML/OLE/RTF) we use
    it. Otherwise, if the result is itself strict base64, we decode EXACTLY once
    more and accept it only if THAT yields a known document — and we LOG a warning
    so the double-encode is observable, not hidden. This makes the parser correct
    whether the gateway single- or double-encodes.

    A genuinely non-base64 ``document`` raises ``binascii.Error`` -> 400
    ``bad_base64``; bytes that decode but are not a parseable document reach the
    reader -> 422 ``document_unreadable``.
    """
    first = base64.b64decode(document_b64, validate=True)
    if _has_doc_magic(first):
        return first
    stripped = first.strip()
    if _STRICT_B64.match(stripped):
        try:
            second = base64.b64decode(stripped, validate=True)
        except (binascii.Error, ValueError):
            return first
        if _has_doc_magic(second):
            _LOG.warning("recovered double-base64-encoded document (%d bytes)", len(second))
            return second
    return first


@app.function_name(name="parse")
@app.route(route="parse", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def parse(req: func.HttpRequest) -> func.HttpResponse:
    """POST /parse — see module docstring.

    Wrapped in a defensive guard: every expected condition returns a structured
    HttpResponse, and ANY unexpected exception is turned into a structured 500
    rather than being allowed to escape the worker (an escaped exception is what
    the Functions host reports to the front end as a 502 BadGateway — the very
    failure mode this guard exists to prevent).
    """
    try:
        return _parse(req)
    except Exception:  # noqa: BLE001 - last line of defence; never let a 502 escape
        _LOG.exception("unhandled error in parse handler")
        return _error(500, "internal_error", "Unexpected internal error while parsing the document.")


def _parse(req: func.HttpRequest) -> func.HttpResponse:
    # --- 1. Parse + validate the request body (400 on any input problem) ----
    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "bad_request", "Request body must be valid JSON.")

    if not isinstance(body, dict):
        return _error(400, "bad_request", "Request body must be a JSON object.")

    document_b64 = body.get("document")
    filename = body.get("filename")
    provider_hint = body.get("provider_hint")

    if not document_b64 or not isinstance(document_b64, str):
        return _error(400, "missing_document", "'document' (base64 string) is required.")
    if not filename or not isinstance(filename, str):
        return _error(400, "missing_filename", "'filename' (string with extension) is required.")
    if provider_hint is not None and not isinstance(provider_hint, str):
        return _error(400, "bad_provider_hint", "'provider_hint' must be a string when provided.")

    try:
        document_bytes = _decode_document(document_b64)
    except (binascii.Error, ValueError):
        return _error(400, "bad_base64", "'document' is not valid base64.")
    if not document_bytes:
        return _error(400, "empty_document", "Decoded 'document' is empty.")

    # --- 2. Run the parser via the adapter seam --------------------------------
    # Three failure classes, three status codes:
    #   DocumentUnreadableError -> 422  the supplied document can't be parsed (client)
    #   ValueError              -> 400  the request was malformed (e.g. bad extension)
    #   ParserError             -> 502  the parser DEPENDENCY itself is broken (server)
    # DocumentUnreadableError subclasses ValueError, so it MUST be caught first.
    try:
        parser_result = parser_adapter.run_parser(document_bytes, filename, provider_hint)
    except DocumentUnreadableError as exc:
        # The bytes are not a parseable document (corrupt / truncated / empty /
        # not a real PDF). NOT a server fault — return 422 so the flow routes the
        # case to needs_review instead of retrying a 5xx. (This is the fix for the
        # 502 burst: an unreadable instruction.pdf used to escape as a 502.)
        _LOG.warning("unreadable document %r: %s", filename, exc)
        return _error(422, "document_unreadable", str(exc))
    except ValueError as exc:
        # Adapter rejected the input (e.g. unsupported extension) -> client error.
        return _error(400, "unsupported_document", str(exc))
    except ParserError as exc:
        # The parser engine/dependency itself failed (not importable, reader
        # binary missing). A genuine upstream-dependency fault -> 502.
        _LOG.exception("parser dependency failed")
        return _error(502, "parser_failed", str(exc))

    # --- 3. Map to the 12-field EVA contract + Case-identity fields ----------
    mapped = parser_adapter.to_eva_extraction(parser_result)
    extraction = mapped["extraction"]
    issues: list[dict[str, Any]] = list(mapped.get("issues", []))

    # --- 4. Validate the FLAT 12-field payload against the keystone schema ---
    flat_payload = {key: cell.get("value", "") for key, cell in extraction.items()}
    try:
        validate_eva_payload(flat_payload)
    except SchemaValidationError as exc:
        # Not a hard failure: an incomplete extraction is normal (parser pre-fills,
        # staff complete the case). We return 200 but surface each schema issue so
        # the flow / Code App can route the case to needs_review / missing fields.
        for issue in exc.issues:
            issues.append(
                {
                    "field": issue["field"],
                    "severity": "error",
                    "code": issue["code"],
                    "message": issue["message"],
                }
            )

    response: dict[str, Any] = {
        "extraction": extraction,
        "vrm": mapped.get("vrm"),
        "reference": mapped.get("reference"),
        "audit": mapped.get("audit"),
        "issues": issues,
        "contract_version": CONTRACT_VERSION,
    }
    return _json(200, response)


@app.function_name(name="extract_images")
@app.route(route="extract-images", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def extract_images_route(req: func.HttpRequest) -> func.HttpResponse:
    """POST /extract-images — pull embedded images out of an instruction document.

    Request (JSON object):
        document   str   base64-encoded source bytes (PDF / DOCX / DOC)
        filename   str   name WITH extension (selects the extractor)

    Response (200):
        { "count": int,
          "images": [ {filename, ext, content_type, size, sha256, content_base64,
                       sequence_index} ],
          "message": str, "contract_version": "cedocumentparser_v2.0_images" }

    A document with no embedded images returns 200 with ``count: 0`` (NOT an error).
    Status codes mirror /parse: 400 bad request · 422 unreadable · 500 internal ·
    502 parser dependency failed. Same defensive wrapper so nothing escapes as a 502.
    """
    try:
        return _extract_images(req)
    except Exception:  # noqa: BLE001 - last line of defence; never let a 502 escape
        _LOG.exception("unhandled error in extract-images handler")
        return _images_error(500, "internal_error", "Unexpected internal error while extracting images.")


IMAGES_CONTRACT_VERSION = "cedocumentparser_v2.0_images"


def _extract_images(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _images_error(400, "bad_request", "Request body must be valid JSON.")
    if not isinstance(body, dict):
        return _images_error(400, "bad_request", "Request body must be a JSON object.")

    document_b64 = body.get("document")
    filename = body.get("filename")
    if not document_b64 or not isinstance(document_b64, str):
        return _images_error(400, "missing_document", "'document' (base64 string) is required.")
    if not filename or not isinstance(filename, str):
        return _images_error(400, "missing_filename", "'filename' (string with extension) is required.")

    try:
        document_bytes = _decode_document(document_b64)
    except (binascii.Error, ValueError):
        return _images_error(400, "bad_base64", "'document' is not valid base64.")
    if not document_bytes:
        return _images_error(400, "empty_document", "Decoded 'document' is empty.")

    try:
        result = parser_adapter.run_image_extraction(document_bytes, filename)
    except DocumentUnreadableError as exc:
        _LOG.warning("unreadable document for image extraction %r: %s", filename, exc)
        return _images_error(422, "document_unreadable", str(exc))
    except ParserError as exc:
        _LOG.exception("image extraction dependency failed")
        return _images_error(502, "parser_failed", str(exc))

    return _json(
        200,
        {
            "count": result.get("count", 0),
            "images": result.get("images", []),
            "message": result.get("message", ""),
            "contract_version": IMAGES_CONTRACT_VERSION,
        },
    )


def _images_error(status: int, code: str, message: str) -> func.HttpResponse:
    return _json(
        status,
        {
            "count": 0,
            "images": [],
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": IMAGES_CONTRACT_VERSION,
        },
    )


@app.function_name(name="classify_email")
@app.route(route="classify-email", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def classify_email_route(req: func.HttpRequest) -> func.HttpResponse:
    """POST /classify-email — deterministic inbound-email triage (Phase 8 / ADR-0015).

    Runs the email through the engine's pure ``classify_email`` (keyword / phrase /
    regex only — no LLM, no Dataverse, no network) and returns the triage label.
    The open-Case lookup (does the body Case/PO or VRM hit an OPEN Case?) stays on
    the flow side, exactly as the Case-identity question stays out of ``/parse`` —
    the route surfaces ``body_caseref`` / ``body_vrm`` so the flow can run it.

    AUTH + guard mirror ``/parse``: FUNCTION-level key, every expected condition
    returns a structured envelope, and any unexpected exception becomes a 500 so
    nothing escapes the worker as a 502.

    Request (JSON object):
        subject               str   email subject (optional)
        body                  str   email body, HTML or text (server-side stripped)
        from                  str   sender address (optional)
        sender_domain         str   sender domain (optional)
        provider_match_state  str   one | none | ambiguous (the flow's match result)
        attachment_kinds      [str] e.g. ["instruction", "image"] (optional)
        has_attachments       bool  (optional)
        in_reply_to           str   RFC-5322 In-Reply-To header (optional) — authoritative
                                    reply signal; strengthens reply/query-on-existing
                                    detection beyond the "RE:" subject fallback
        references            str   RFC-5322 References header (optional) — as above

    Response (200): the classifier result + ``contract_version`` (incl. ``is_reply``).
    Status codes: 200 classified · 400 bad request · 500 unexpected internal error.
    """
    try:
        return _classify_email(req)
    except Exception:  # noqa: BLE001 - last line of defence; never let a 502 escape
        _LOG.exception("unhandled error in classify-email handler")
        return _classify_error(500, "internal_error", "Unexpected internal error while classifying the email.")


def _classify_email(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return _classify_error(400, "bad_request", "Request body must be valid JSON.")

    if not isinstance(body, dict):
        return _classify_error(400, "bad_request", "Request body must be a JSON object.")

    subject = body.get("subject", "")
    raw_body = body.get("body", "")
    from_address = body.get("from", "")
    sender_domain = body.get("sender_domain", "")
    provider_match_state = body.get("provider_match_state", "")
    attachment_kinds = body.get("attachment_kinds")
    has_attachments = body.get("has_attachments", False)
    in_reply_to = body.get("in_reply_to", "")
    references = body.get("references", "")

    for name, value in (
        ("subject", subject),
        ("body", raw_body),
        ("from", from_address),
        ("sender_domain", sender_domain),
        ("provider_match_state", provider_match_state),
        ("in_reply_to", in_reply_to),
        ("references", references),
    ):
        if value is not None and not isinstance(value, str):
            return _classify_error(400, "bad_field", f"'{name}' must be a string when provided.")
    if attachment_kinds is not None and not isinstance(attachment_kinds, list):
        return _classify_error(400, "bad_field", "'attachment_kinds' must be a list when provided.")

    plain_body = _strip_html(raw_body)

    result = classify_email(
        subject=subject,
        body=plain_body,
        from_address=from_address,
        sender_domain=sender_domain,
        provider_match_state=provider_match_state,
        attachment_kinds=attachment_kinds,
        has_attachments=has_attachments,
        in_reply_to=in_reply_to,
        references=references,
    )
    return _json(200, result)


def _classify_error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured error envelope for /classify-email, shaped like the success body
    (a stable ``category``/``subtype``/``signals`` plus the issue) so callers parse
    one schema. The classifier never fails to a label here — an input error returns
    the catch-all ``other`` so a malformed call still routes safely to a human."""
    return _json(
        status,
        {
            "category": "other",
            "subtype": "other",
            "confidence": 0.0,
            "signals": [f"error:{code}"],
            "is_reply": False,
            "body_vrm": "",
            "body_caseref": "",
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": EMAIL_CONTRACT_VERSION,
        },
    )


def _json(status: int, payload: dict[str, Any]) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )


def _error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured error envelope. ``issues`` mirrors the success shape so callers parse one schema."""
    return _json(
        status,
        {
            "extraction": None,
            "vrm": None,
            "reference": None,
            "audit": None,
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": CONTRACT_VERSION,
        },
    )
