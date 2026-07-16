"""HTTP entry point for full-address location suggestions.

``POST /location-suggest`` accepts case photo references and text clues, invokes
the suggestion core, and returns reviewable address candidates. The calling Data
API owns feature availability and supplies photo bytes; this service does not
read or write Case records.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import azure.functions as func

import location_suggest
from ai_reasoning import build_reasoner
from location_suggest import AllPhotosUnreadable, CONTRACT_VERSION
from maps_client import MapsClient, MapsNotConfigured
from photo_source import PhotoRef, select_photo_source
from vision_client import VisionClient, VisionNotConfigured

app = func.FunctionApp()

_LOG = logging.getLogger("ce.location_suggest")


@app.function_name(name="location-suggest")
@app.route(route="location-suggest", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def location_suggest_route(req: func.HttpRequest) -> func.HttpResponse:
    """POST /location-suggest — see module docstring.

    Wrapped in a defensive guard so every expected condition returns a structured
    HttpResponse and ANY unexpected exception becomes a structured 500 rather than
    escaping the worker (an escaped exception is what the host surfaces as a 502).
    """
    try:
        return _handle(req)
    except Exception:  # noqa: BLE001 - last line of defence; never let a raw 502 escape
        _LOG.exception("unhandled error in location-suggest handler")
        return _error(500, "internal_error", "Unexpected internal error while suggesting locations.")


def _handle(req: func.HttpRequest) -> func.HttpResponse:
    # --- 1. Parse + validate the request body (400 on any input problem) ------
    try:
        body = req.get_json()
    except ValueError:
        return _error(400, "bad_request", "Request body must be valid JSON.")

    if not isinstance(body, dict):
        return _error(400, "bad_request", "Request body must be a JSON object.")

    raw_photo_refs = body.get("photo_refs", [])
    if raw_photo_refs is None:
        raw_photo_refs = []
    if not isinstance(raw_photo_refs, list):
        return _error(400, "bad_photo_refs", "'photo_refs' must be an array when provided.")

    photo_refs: list[PhotoRef] = []
    for idx, item in enumerate(raw_photo_refs):
        if not isinstance(item, dict):
            return _error(400, "bad_photo_refs", f"photo_refs[{idx}] must be an object.")
        evidence_id = item.get("evidence_id")
        if not evidence_id or not isinstance(evidence_id, str):
            return _error(400, "bad_photo_refs", f"photo_refs[{idx}].evidence_id (string) is required.")
        photo_refs.append(
            PhotoRef(
                evidence_id=evidence_id,
                box_file_id=_opt_str(item.get("box_file_id")),
                filename=_opt_str(item.get("filename")),
                image_role=_opt_str(item.get("image_role")),
                inline_b64=_opt_str(item.get("image_base64")),
            )
        )

    text_clues = body.get("text_clues") or {}
    if not isinstance(text_clues, dict):
        return _error(400, "bad_text_clues", "'text_clues' must be an object when provided.")
    accident_circumstances = _opt_str(text_clues.get("accident_circumstances"))
    claimant_address = _opt_str(text_clues.get("claimant_address"))

    max_candidates = location_suggest.clamp_max_candidates(body.get("max_candidates"))
    # Reviewer-invoked DEEP escalation (TKT-078). build_reasoner() returns None unless the
    # LOCATION_ASSIST_AI_ENABLED gate + model config + a mintable MSI token are all present, so
    # a `deep` request with the escalation off is an honest no-op.
    deep = bool(body.get("deep"))
    ai_reasoner = build_reasoner() if deep else None

    # --- 2. Build dependencies (inline bytes preferred; Vision/Maps lazy) -----
    # Inline bytes from the Data API use InlinePhotoSource. Tests without inline
    # bytes use the configured fixture source; direct Archive reads fail closed.
    # The Vision/Maps clients read their secret references lazily on
    # first use. None of this touches the network here.
    photo_source = select_photo_source(photo_refs)
    vision = VisionClient()
    maps = MapsClient()

    # --- 3. Run the core orchestration ---------------------------------------
    try:
        result = location_suggest.suggest_locations(
            photo_refs=photo_refs,
            accident_circumstances=accident_circumstances,
            claimant_address=claimant_address,
            max_candidates=max_candidates,
            photo_source=photo_source,
            vision=vision,
            maps=maps,
            deep=deep,
            ai_reasoner=ai_reasoner,
        )
    except AllPhotosUnreadable as exc:
        # Client condition (the supplied photos cannot be read and there is no
        # text clue) -> 422, mirroring the parser's document_unreadable -> 422.
        _LOG.warning("photos unreadable for case_id=%s: %s", _opt_str(body.get("case_id")), exc)
        return _error(422, "photos_unreadable", "The supplied photos could not be read.")
    except (VisionNotConfigured, MapsNotConfigured) as exc:
        # A required Vision/Maps dependency is not wired -> 502 (server fault).
        _LOG.error("location-suggest dependency not configured: %s", type(exc).__name__)
        return _error(502, "dependency_not_configured", "A required location service is not configured.")
    finally:
        vision.close()
        maps.close()

    return _json(200, result.to_response())


def _opt_str(value: Any) -> str | None:
    if isinstance(value, str):
        s = value.strip()
        return s or None
    return None


def _json(status: int, payload: dict[str, Any]) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(payload, ensure_ascii=False),
        status_code=status,
        mimetype="application/json",
    )


def _error(status: int, code: str, message: str) -> func.HttpResponse:
    """Structured error envelope mirroring the success shape: candidates:[],
    noConfidentLocation:true, a single issues entry, contract_version stamped."""
    return _json(
        status,
        {
            "candidates": [],
            "noConfidentLocation": True,
            "issues": [{"field": "(request)", "severity": "error", "code": code, "message": message}],
            "contract_version": CONTRACT_VERSION,
        },
    )
