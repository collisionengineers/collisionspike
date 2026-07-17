"""function_app — Collision Engineers parser Function (Azure Functions Python v2).

HTTP trigger ``POST /parse``. Accepts a base64-encoded instruction document,
runs it through the sibling ``cedocumentmapper_v2`` parser (via parser_adapter,
the only seam), maps the result onto the settled 12-field snake_case EVA
contract with per-field ``{value, confidence, source, warnings?}``, surfaces
``vrm``/``reference``/``vin`` SEPARATELY (identity fields, NOT in the EVA payload),
validates the flat 12-field payload against ``contracts/eva-payload.schema.json``,
and returns a structured envelope.

[BUILD] — authored offline; no Azure/tenant contact (tests mock the parser seam).

AUTH: function-level; a function key is required and the host is never left open.

Feature availability is enforced by the calling service. The function does not
read the gate.

Response envelope:
    {
      "extraction":       { <12 EVA keys in order>: {value, confidence, source, warnings?} },
      "vrm":              {value, confidence, source, warnings?} | null,
      "reference":        {value, confidence, source, warnings?} | null,
      "vin":              {value, confidence, source, warnings?} | null,
      "audit":            {value: bool, signals: [...], source} | null,
      "content_typing":   {doc_type, provider_name, markers} | null,
      "issues":           [ {field, severity?, code, message} ],
      "contract_version": "cedocumentparser_v2.0_eva_json"
    }

``content_typing`` (rules-engine-v2 Phase 3, net-new): the vendored engine's
``detection.attachment_typing.type_document_text`` run over the parsed
document's own extracted text, typing it ``instruction`` / ``report`` /
``junk`` / ``unknown`` BY CONTENT — never by filename/extension. Additive and
unconditional (no gate; always computed, cheap + pure). This is deliberately
just a RESPONSE field today, not a classifier input: the email-intake
pipeline classifies the EMAIL (orchestration step 1.5) BEFORE this route ever
runs (step 4), so this typing cannot yet feed back into the email
classifier's Rule 1 corroboration gate without a pipeline reorder — that is
tracked as a follow-up, not solved here. What IS live: a downstream
resolve/identification layer or telemetry pipeline can consume this field
today, straight off the /parse response.

Status codes:
    200  parsed + schema-valid (or schema-invalid surfaced in issues, see below)
    400  bad request (missing/!base64 document, missing/unsupported filename, bad JSON)
    422  the document itself is unreadable (corrupt/truncated/not a real PDF/etc.) —
         a client problem the parser cannot fix; the caller routes the case to review
    500  unexpected internal error (defensive; should never escape as a raw 502)
    502  parser DEPENDENCY failed — engine not importable / reader binary missing
         (ParserError); a genuine server-side fault, safe for the caller to retry
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import re
from pathlib import Path
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
_VENDOR_LOCK_PATH = Path(__file__).resolve().parent / "cedocumentmapper_v2" / "VENDOR_LOCK.json"


@app.route(route="fingerprint", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def fingerprint(req: func.HttpRequest) -> func.HttpResponse:
    """Return the immutable vendored-engine identity of this deployed package.

    This endpoint is deliberately separate from the byte-stable parse envelope. It exposes
    no secrets or case data, but remains function-key protected so deployment verification
    uses the same caller boundary as the parser routes.
    """
    del req
    try:
        lock = json.loads(_VENDOR_LOCK_PATH.read_text(encoding="utf-8"))
        payload = {
            "contract": "ce-parser-fingerprint-v1",
            "repository": lock["repository"],
            "ref": lock["ref"],
            "commit": lock["commit"],
            "vendored_file_count": lock["vendoredFileCount"],
            "content_sha256": lock["contentSha256"],
            "providers_sha256": lock["providersSha256"],
        }
        return func.HttpResponse(
            json.dumps(payload, separators=(",", ":")),
            status_code=200,
            mimetype="application/json",
        )
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        _LOG.exception("Parser vendor fingerprint unavailable")
        return func.HttpResponse(
            json.dumps({"error": "fingerprint_unavailable"}),
            status_code=500,
            mimetype="application/json",
        )

# Strip HTML tags + decode the common entities so the deterministic keyword / VRM
# scan runs over plain text whether the caller sends HTML or text
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

    Some upstream transports redundantly wrap an already-base64 document. A single
    decode therefore sometimes yields the real bytes and sometimes yields the
    base64-ASCII representation of those bytes.

    We decode once; if the result is a known document (PDF/OOXML/OLE/RTF) we use
    it. Otherwise, if the result is itself strict base64, we decode EXACTLY once
    more and accept it only if THAT yields a known document — and we LOG a warning
    so the redundant wrapper is observable, not hidden.

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
        # not a real PDF). NOT a server fault — return 422 so the workflow service routes the
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

    # --- 3. Map to the 12-field EVA contract + separate identity fields ------
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
        # the caller can route the case to review or missing fields.
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
        "vin": mapped.get("vin"),
        "audit": mapped.get("audit"),
        "content_typing": mapped.get("content_typing"),
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
        provider   str?  resolved work-provider principal (e.g. QDOS) — stem token (TKT-143)
        vrm        str?  resolved registration — stem token (TKT-143); both OPTIONAL,
                         omitted-when-unknown (neutral stems, TKT-090)

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

    # TKT-143 — optional resolved-identity stem tokens; non-strings are ignored
    # (never a 400: identity is additive, extraction must proceed without it).
    provider = body.get("provider")
    vrm = body.get("vrm")
    provider = provider if isinstance(provider, str) and provider.strip() else None
    vrm = vrm if isinstance(vrm, str) and vrm.strip() else None

    try:
        result = parser_adapter.run_image_extraction(
            document_bytes, filename, provider=provider, vrm=vrm
        )
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
    regex only — no LLM, persistence, or network) and returns the triage label.
    The open-Case lookup (does the body Case/PO or VRM hit an OPEN Case?) stays on
    the orchestration side, exactly as the Case-identity question stays out of
    ``/parse``. The route surfaces ``body_caseref`` / ``body_vrm`` for that lookup.

    AUTH + guard mirror ``/parse``: FUNCTION-level key, every expected condition
    returns a structured envelope, and any unexpected exception becomes a 500 so
    nothing escapes the worker as a 502.

    Request (JSON object):
        subject               str   email subject (optional)
        body                  str   email body, HTML or text (server-side stripped)
        from                  str   sender address (optional)
        sender_domain         str   sender domain (optional)
        authentication_results str recipient-stamped Authentication-Results header (optional)
        provider_match_state  str   one | none | ambiguous (the caller's match result)
        attachment_kinds      [str] e.g. ["instruction", "image"] (optional)
        attachment_filenames  [str] original attachment filenames (optional) — lets the
                                    classifier spot an engineer's REPORT (existing-work
                                    artefact, TKT-037/039) that the kind alone can't
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
    authentication_results = body.get("authentication_results", "")
    provider_match_state = body.get("provider_match_state", "")
    attachment_kinds = body.get("attachment_kinds")
    attachment_filenames = body.get("attachment_filenames")
    has_attachments = body.get("has_attachments", False)
    in_reply_to = body.get("in_reply_to", "")
    references = body.get("references", "")

    for name, value in (
        ("subject", subject),
        ("body", raw_body),
        ("from", from_address),
        ("sender_domain", sender_domain),
        ("authentication_results", authentication_results),
        ("provider_match_state", provider_match_state),
        ("in_reply_to", in_reply_to),
        ("references", references),
    ):
        if value is not None and not isinstance(value, str):
            return _classify_error(400, "bad_field", f"'{name}' must be a string when provided.")
    if attachment_kinds is not None and not isinstance(attachment_kinds, list):
        return _classify_error(400, "bad_field", "'attachment_kinds' must be a list when provided.")
    if attachment_filenames is not None and not isinstance(attachment_filenames, list):
        return _classify_error(400, "bad_field", "'attachment_filenames' must be a list when provided.")

    plain_body = _strip_html(raw_body)

    result = classify_email(
        subject=subject,
        body=plain_body,
        from_address=from_address,
        sender_domain=sender_domain,
        authentication_results=authentication_results,
        provider_match_state=provider_match_state,
        attachment_kinds=attachment_kinds,
        has_attachments=has_attachments,
        in_reply_to=in_reply_to,
        references=references,
        attachment_filenames=attachment_filenames,
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


# ===========================================================================
# /explode-eml — unpack an archived .eml into headers/body/attachments
# (ADR-0022 R2 retro reconstruction). WRAPPER-ONLY: Python stdlib `email`, no
# cedocumentmapper_v2 engine involvement (ADR-0018 — the vendored tree is not
# edited for this route). The orchestration downloads the original instruction
# .eml from the READ-ONLY Box archive, explodes it here, blob-lands the parts,
# and feeds the instruction attachment to /parse exactly like live intake.
# ===========================================================================

EML_CONTRACT_VERSION = "explode_eml_v1"
# Mirror of the intake body cap (classify path) — the reconstruction only needs
# enough body for circumstances supplement + key corroboration.
_EML_BODY_CAP = 20_000
# The facade rides base64-in-JSON: cap each attachment + the whole response.
_EML_ATTACHMENT_MAX_BYTES = 26_214_400  # 25 MiB
_EML_TOTAL_MAX_BYTES = 78_643_200  # 75 MiB across all attachments
# OLE Compound File magic — an Outlook ``.msg`` original (D0 CF 11 E0 A1 B1 1A E1).
# Box archives hold originals as RFC-822 ``.eml`` OR Outlook OLE ``.msg``; both
# route through /explode-eml and return the SAME explode_eml_v1 response shape.
_MSG_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


@app.function_name(name="explode_eml")
@app.route(route="explode-eml", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def explode_eml(req: func.HttpRequest) -> func.HttpResponse:
    """POST /explode-eml — { document: base64(.eml or .msg bytes), filename? } ->
    { subject, from, date_iso, message_id, in_reply_to, references, body_text,
      attachments: [{ filename, content_type, size, sha256, content_base64 }],
      skipped: [{ filename, reason }] }.
    Outlook ``.msg`` originals (detected by OLE magic bytes and/or a .msg
    filename) are unpacked via ``extract_msg`` into the SAME response shape.
    Same defensive guard as /parse: nothing escapes as a 502."""
    try:
        return _explode_eml(req)
    except Exception:  # noqa: BLE001 - last line of defence; never let a 502 escape
        _LOG.exception("unhandled error in explode-eml handler")
        return _eml_error(500, "internal_error", "Unexpected internal error while unpacking the email.")


def _explode_eml(req: func.HttpRequest) -> func.HttpResponse:
    import email as _email
    from email import policy as _email_policy
    from email.utils import parsedate_to_datetime as _parsedate

    try:
        body = req.get_json()
    except ValueError:
        return _eml_error(400, "invalid_json", "Request body must be JSON.")
    if not isinstance(body, dict):
        return _eml_error(400, "invalid_json", "Request body must be a JSON object.")
    document_b64 = body.get("document")
    if not isinstance(document_b64, str) or not document_b64.strip():
        return _eml_error(400, "missing_document", "Field 'document' (base64 .eml bytes) is required.")
    try:
        raw = base64.b64decode(document_b64, validate=True)
    except (binascii.Error, ValueError):
        return _eml_error(400, "bad_base64", "Field 'document' is not valid base64.")
    if not raw.strip():
        return _eml_error(422, "eml_unreadable", "Decoded email is empty.")

    filename = body.get("filename", "")
    if filename is not None and not isinstance(filename, str):
        return _eml_error(400, "bad_field", "'filename' must be a string when provided.")
    if raw.startswith(_MSG_OLE_MAGIC) or str(filename or "").lower().endswith(".msg"):
        return _explode_msg(raw)

    msg = _email.message_from_bytes(raw, policy=_email_policy.default)

    def _hdr(name: str) -> str:
        try:
            return str(msg.get(name, "") or "").strip()
        except Exception:  # noqa: BLE001 - a single mangled header must not sink the explode
            return ""

    date_iso = ""
    raw_date = _hdr("Date")
    if raw_date:
        try:
            parsed = _parsedate(raw_date)
            date_iso = parsed.isoformat() if parsed is not None else ""
        except (TypeError, ValueError):
            date_iso = ""

    # Body: prefer the text/plain part; fall back to stripped HTML. get_body()
    # honours multipart/alternative preference order for us.
    body_text = ""
    try:
        plain = msg.get_body(preferencelist=("plain",))
        if plain is not None:
            body_text = str(plain.get_content() or "")
        else:
            html = msg.get_body(preferencelist=("html",))
            if html is not None:
                body_text = _strip_html(str(html.get_content() or ""))
    except Exception:  # noqa: BLE001 - mangled MIME: degrade to no body, keep attachments
        body_text = ""
    body_text = body_text[:_EML_BODY_CAP]

    attachments: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    total = 0
    for index, part in enumerate(msg.iter_attachments()):
        try:
            content_type = str(part.get_content_type() or "application/octet-stream")
            filename = str(part.get_filename() or "")
            if content_type == "message/rfc822" or filename.lower().endswith(".eml"):
                # A forwarded original — re-emit the nested message as .eml bytes so the
                # caller can recurse or parse it as the instruction email itself.
                payload = part.get_payload()
                if isinstance(payload, list) and payload:
                    content = payload[0].as_bytes()
                elif isinstance(payload, (bytes, bytearray)):
                    content = bytes(payload)
                else:
                    content = part.get_payload(decode=True) or b""
                filename = filename or f"forwarded-{index + 1}.eml"
                content_type = "message/rfc822"
            else:
                content = part.get_payload(decode=True) or b""
                filename = filename or f"attachment-{index + 1}"
        except Exception:  # noqa: BLE001 - one mangled part must not sink the rest
            skipped.append({"filename": f"part-{index + 1}", "reason": "unreadable_part"})
            continue
        total = _bound_attachment(filename, content_type, content, attachments, skipped, total)

    return _json(
        200,
        {
            "subject": _hdr("Subject"),
            "from": _hdr("From"),
            "to": _hdr("To"),
            "date_iso": date_iso,
            "message_id": _hdr("Message-ID"),
            "in_reply_to": _hdr("In-Reply-To"),
            "references": _hdr("References"),
            "body_text": body_text,
            "attachments": attachments,
            "skipped": skipped,
            "contract_version": EML_CONTRACT_VERSION,
        },
    )


def _bound_attachment(
    filename: str,
    content_type: str,
    content: bytes,
    attachments: list[dict[str, Any]],
    skipped: list[dict[str, str]],
    total: int,
) -> int:
    """Shared size discipline for exploded attachments (.eml and .msg paths):
    drop empty parts, cap each part and the running total, and append the
    base64 record. Returns the updated running total."""
    import hashlib as _hashlib

    size = len(content)
    if size == 0:
        skipped.append({"filename": filename, "reason": "empty"})
        return total
    if size > _EML_ATTACHMENT_MAX_BYTES:
        skipped.append({"filename": filename, "reason": "too_large"})
        return total
    if total + size > _EML_TOTAL_MAX_BYTES:
        skipped.append({"filename": filename, "reason": "total_cap"})
        return total
    attachments.append(
        {
            "filename": filename,
            "content_type": content_type,
            "size": size,
            "sha256": _hashlib.sha256(content).hexdigest(),
            "content_base64": base64.b64encode(content).decode("ascii"),
        }
    )
    return total + size


def _explode_msg(raw: bytes) -> func.HttpResponse:
    """Unpack an Outlook OLE ``.msg`` original into the exact explode_eml_v1
    response shape. Box archives hold some originals as ``.msg`` (dragged out of
    Outlook) rather than RFC-822 ``.eml``; without this branch they degraded to
    unreadable raw bytes downstream. Parsed with ``extract_msg`` — already a
    pinned runtime dependency (the vendored engine's MSG reader uses it).

    Body preference: ``msg.body`` (extract_msg derives plain text, including
    from RTF-only bodies where deencapsulation is possible), then text-stripped
    ``msg.htmlBody``. Regular attachments are emitted like .eml attachments;
    embedded Outlook items are re-emitted as raw ``.msg`` bytes when exportable
    (parity with nested message/rfc822 -> .eml) and skipped otherwise. A
    corrupt/unparseable ``.msg`` returns the same graceful 422 envelope the
    .eml path uses for unreadable input."""
    import datetime as _datetime
    import mimetypes as _mimetypes
    from email.utils import parsedate_to_datetime as _parsedate

    import extract_msg

    def _text(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, (bytes, bytearray)):
            return bytes(value).decode("utf-8", errors="ignore").replace("\x00", "").strip()
        return str(value).replace("\x00", "").strip()

    try:
        msg = extract_msg.Message(raw)
    except Exception:  # noqa: BLE001 - corrupt OLE / not a message: typed 422, like eml_unreadable
        _LOG.warning("unreadable .msg in explode-eml", exc_info=True)
        return _eml_error(422, "msg_unreadable", "Decoded .msg could not be parsed as an Outlook message.")
    try:
        def _prop(name: str) -> str:
            try:
                return _text(getattr(msg, name, None))
            except Exception:  # noqa: BLE001 - one mangled property must not sink the explode
                return ""

        date_iso = ""
        try:
            raw_date = getattr(msg, "date", None)
            if isinstance(raw_date, _datetime.datetime):
                date_iso = raw_date.isoformat()
            elif raw_date:
                parsed = _parsedate(str(raw_date))
                date_iso = parsed.isoformat() if parsed is not None else ""
        except (TypeError, ValueError):
            date_iso = ""

        references = ""
        try:
            header = getattr(msg, "header", None)
            if header is not None:
                references = _text(header.get("References", ""))
        except Exception:  # noqa: BLE001 - transport headers are optional in .msg
            references = ""

        body_text = _prop("body")
        if not body_text:
            html = _prop("htmlBody")
            if html:
                body_text = _strip_html(html)
        body_text = body_text[:_EML_BODY_CAP]

        attachments: list[dict[str, Any]] = []
        skipped: list[dict[str, str]] = []
        total = 0
        for index, att in enumerate(list(getattr(msg, "attachments", None) or [])):
            try:
                filename = ""
                for name_attr in ("longFilename", "shortFilename", "displayName", "name"):
                    filename = _text(getattr(att, name_attr, None))
                    if filename:
                        break
                filename = filename or f"attachment-{index + 1}"
                data = getattr(att, "data", None)
                if isinstance(data, (bytes, bytearray)):
                    content = bytes(data)
                    content_type = _text(getattr(att, "mimetype", None)) or (
                        _mimetypes.guess_type(filename)[0] or "application/octet-stream"
                    )
                elif data is not None and hasattr(data, "exportBytes"):
                    # An embedded Outlook item — re-emit its raw .msg bytes so the
                    # caller can recurse (parity with nested message/rfc822 -> .eml).
                    content = bytes(data.exportBytes())
                    if not filename.lower().endswith(".msg"):
                        filename = f"{filename}.msg"
                    content_type = "application/vnd.ms-outlook"
                else:
                    skipped.append({"filename": filename, "reason": "unsupported_part"})
                    continue
            except Exception:  # noqa: BLE001 - one mangled attachment must not sink the rest
                skipped.append({"filename": f"part-{index + 1}", "reason": "unreadable_part"})
                continue
            total = _bound_attachment(filename, content_type, content, attachments, skipped, total)

        return _json(
            200,
            {
                "subject": _prop("subject"),
                "from": _prop("sender"),
                "to": _prop("to"),
                "date_iso": date_iso,
                "message_id": _prop("messageId"),
                "in_reply_to": _prop("inReplyTo"),
                "references": references,
                "body_text": body_text,
                "attachments": attachments,
                "skipped": skipped,
                "contract_version": EML_CONTRACT_VERSION,
            },
        )
    finally:
        try:
            msg.close()
        except Exception:  # noqa: BLE001 - close failure must not mask the response
            pass


def _eml_error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured error envelope for /explode-eml — mirrors the success shape."""
    return _json(
        status,
        {
            "subject": "",
            "from": "",
            "to": "",
            "date_iso": "",
            "message_id": "",
            "in_reply_to": "",
            "references": "",
            "body_text": "",
            "attachments": [],
            "skipped": [],
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": EML_CONTRACT_VERSION,
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
            "vin": None,
            "audit": None,
            "content_typing": None,
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": CONTRACT_VERSION,
        },
    )
