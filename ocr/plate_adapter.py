"""plate_adapter — the ONLY seam for reading a registration plate from a photo.

Single place the OCR host touches the plate engines (`fast-alpr` ONNX models, or
Document Intelligence Read as the managed fallback). Mirrors the parser's adapter
pattern: tests monkeypatch ``read_plate`` so the suite runs WITHOUT ONNX /
`fast-alpr` / an HTTP client installed.

Two engines, one switch (``PLATE_PROVIDER`` -> ``provider`` here):

  provider="fast_alpr" (default)  ankandrew/fast-alpr — a detector (YOLO) + plate
      OCR (CCT) ONNX pipeline, CPU, MIT. The RIGHT tool: it FINDS the plate region
      in a cluttered vehicle scene and reads it, which a page-OCR engine run over
      the whole photo does not. Models are baked into the image (cold-start) or
      downloaded on first use.

  provider="docintel"             Azure AI Document Intelligence Read
      (`prebuilt-read`, GA 2024-11-30) over the WHOLE photo; we then substring-match
      the case VRM in the returned text. No plate localisation -> lower precision,
      but managed and adequate for M1's "does the image's OCR text contain the
      case VRM?" check (image-rules.ts / data-model.md). Do NOT use Azure AI Vision
      Image Analysis Read — DEPRECATED, retires 2028-09-25 (docs/plans/phase-5-ocr-and-scale/ocr-strategy §0).

M1 SCOPE (ADR-0009): read the plate well enough to set Evidence
``registrationVisible`` and VRM-match images to the open Case (ADR-0002/0007).
Role tagging (overview vs damage) and person/reflection detection are M2 — NOT here.

``read_plate`` returns a dict:
    {
      "plate_text":           "<best plate, normalised display form or raw>",
      "confidence":           float | None,        # best detection confidence
      "registration_visible": bool,                # a plausible plate was read
      "vrm_match":            bool | None,          # None when no case_vrm supplied
      "raw_candidates":       [ {"text","confidence"}... ],
      "issues":               [ {field,severity?,code,message}... ],
    }
"""

from __future__ import annotations

import os
import re
from typing import Any


class PlateOcrError(RuntimeError):
    """Raised when plate OCR fails. The handler maps this to a 502."""


# A "looks like a UK plate" gate. UK current format is `AA00 AAA`; we are lenient
# (older/personal plates vary) — require 5-8 alphanumerics with >=2 letters and
# >=1 digit after normalisation, which screens out road signs / random scene text
# while accepting all standard UK plate styles. M1 only needs recognition.
_MIN_PLATE_LEN = 5
_MAX_PLATE_LEN = 8
_CURRENT_UK_RE = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z]{3}$")  # AA00AAA (post-2001)


def normalise_vrm(value: str | None) -> str:
    """Canonical VRM form for comparison: uppercase, strip all non-alphanumerics.

    'AB12 CDE' / 'ab12-cde' / 'AB12CDE' all -> 'AB12CDE'. Matches the VRM
    normalisation the rest of the pipeline uses for image-to-Case correlation.
    """
    if not value:
        return ""
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _looks_like_plate(normalised: str) -> bool:
    if not (_MIN_PLATE_LEN <= len(normalised) <= _MAX_PLATE_LEN):
        return False
    letters = sum(c.isalpha() for c in normalised)
    digits = sum(c.isdigit() for c in normalised)
    return letters >= 2 and digits >= 1


def read_plate(
    image_bytes: bytes,
    filename: str,
    *,
    case_vrm: str | None = None,
    provider: str = "fast_alpr",
) -> dict[str, Any]:
    """Read a registration plate from a vehicle photo. The function tests patch.

    All heavy imports are LAZY so importing this module needs neither
    `fast-alpr`/ONNX nor an HTTP client. ``provider`` selects the engine.
    """
    provider = (provider or "fast_alpr").strip().lower()
    if provider == "docintel":
        candidates = _candidates_via_docintel(image_bytes)
    else:
        candidates = _candidates_via_fast_alpr(image_bytes)

    return _build_result(candidates, case_vrm=case_vrm)


def _build_result(
    candidates: list[dict[str, Any]],
    *,
    case_vrm: str | None,
) -> dict[str, Any]:
    """Turn raw OCR candidates into the settled plate result + VRM match.

    Pure + deterministic so it can be unit-tested directly. ``candidates`` is a
    list of ``{"text": str, "confidence": float|None}`` in any order.
    """
    issues: list[dict[str, Any]] = []

    # Keep only plate-shaped candidates; sort best-confidence first.
    shaped: list[tuple[str, str, float]] = []  # (display_text, normalised, confidence)
    for cand in candidates:
        raw = (cand.get("text") or "").strip()
        norm = normalise_vrm(raw)
        if _looks_like_plate(norm):
            conf = cand.get("confidence")
            shaped.append((raw, norm, float(conf) if isinstance(conf, (int, float)) else 0.0))
    shaped.sort(key=lambda t: t[2], reverse=True)

    case_norm = normalise_vrm(case_vrm)
    vrm_match: bool | None = None
    best_text = ""
    best_conf: float | None = None

    if case_norm:
        # Prefer the candidate that matches the case VRM, if any.
        match = next((s for s in shaped if s[1] == case_norm), None)
        if match is not None:
            vrm_match = True
            best_text, _, best_conf = match[0], match[1], match[2]
        else:
            vrm_match = False
            if shaped:
                best_text, _, best_conf = shaped[0]
    else:
        if shaped:
            best_text, _, best_conf = shaped[0]

    registration_visible = bool(shaped)
    if not shaped:
        issues.append(
            {
                "field": "(plate)",
                "severity": "info",
                "code": "no_plate_found",
                "message": "No plausible registration plate was read from the image.",
            }
        )
    if case_norm and vrm_match is False:
        issues.append(
            {
                "field": "(plate)",
                "severity": "info",
                "code": "vrm_mismatch",
                "message": "Read a plate but it does not match the case VRM.",
            }
        )

    return {
        "plate_text": best_text,
        "confidence": best_conf,
        "registration_visible": registration_visible,
        "vrm_match": vrm_match,
        "raw_candidates": [{"text": s[0], "confidence": s[2]} for s in shaped],
        "issues": issues,
    }


# --------------------------------------------------------------------------- #
# Engine: fast-alpr (primary)                                                  #
# --------------------------------------------------------------------------- #
# Lazy singleton so the (cold) model load happens once per warm worker, not per
# request — material for ACA cold-start (docs/plans/phase-5-ocr-and-scale/ocr-strategy §10.5).
_ALPR_SINGLETON: Any = None


def _get_alpr() -> Any:
    global _ALPR_SINGLETON
    if _ALPR_SINGLETON is not None:
        return _ALPR_SINGLETON
    try:
        from fast_alpr import ALPR  # type: ignore
    except Exception as exc:  # pragma: no cover - only with fast-alpr absent
        raise PlateOcrError(f"fast-alpr is not importable: {exc}") from exc

    # Defaults track the current fast-alpr published models (PyPI). The detector
    # finds the plate region; the multinational CCT OCR reads it (UK plates are
    # standard Latin AA00 AAA). Both overridable via app settings.
    detector = os.environ.get("ALPR_DETECTOR_MODEL") or "yolo-v9-t-384-license-plate-end2end"
    ocr_model = os.environ.get("ALPR_OCR_MODEL") or "cct-xs-v2-global-model"
    try:
        _ALPR_SINGLETON = ALPR(detector_model=detector, ocr_model=ocr_model)
    except Exception as exc:
        raise PlateOcrError(f"failed to initialise fast-alpr: {exc}") from exc
    return _ALPR_SINGLETON


def _candidates_via_fast_alpr(image_bytes: bytes) -> list[dict[str, Any]]:
    """Detect + read plate(s) with fast-alpr -> candidate list."""
    try:
        import numpy as np  # type: ignore
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise PlateOcrError(f"numpy/Pillow not importable: {exc}") from exc

    import io as _io

    alpr = _get_alpr()
    try:
        img = Image.open(_io.BytesIO(image_bytes)).convert("RGB")
        frame = np.array(img)[:, :, ::-1]  # RGB -> BGR (fast-alpr expects cv2/BGR)
        results = alpr.predict(frame)
    except Exception as exc:
        raise PlateOcrError(f"fast-alpr prediction failed: {exc}") from exc

    candidates: list[dict[str, Any]] = []
    for r in results or []:
        # fast-alpr result objects expose `.ocr.text` / `.ocr.confidence`; be
        # defensive across versions.
        text = None
        conf = None
        ocr = getattr(r, "ocr", None)
        if ocr is not None:
            text = getattr(ocr, "text", None)
            conf = getattr(ocr, "confidence", None)
        if text is None and isinstance(r, dict):
            text = (r.get("ocr") or {}).get("text")
            conf = (r.get("ocr") or {}).get("confidence")
        if text:
            candidates.append({"text": text, "confidence": conf})
    return candidates


# --------------------------------------------------------------------------- #
# Engine: Document Intelligence Read (managed fallback)                         #
# --------------------------------------------------------------------------- #
def _candidates_via_docintel(image_bytes: bytes) -> list[dict[str, Any]]:
    """Run DI Read over the whole photo; every read line becomes a candidate.

    `_build_result` then filters to plate-shaped tokens and (when a case VRM is
    given) matches it. Reuses the same server-side DI Read client as the doc path.
    """
    from ocr_pdf_adapter import OcrError, docintel_read_bytes

    ctype = _content_type_for(image_bytes)
    try:
        text = docintel_read_bytes(image_bytes, content_type=ctype)
    except OcrError as exc:
        raise PlateOcrError(str(exc)) from exc

    candidates: list[dict[str, Any]] = []
    for token in re.split(r"\s+", text or ""):
        token = token.strip()
        if token:
            # DI Read does not give per-token plate confidence here; mark None.
            candidates.append({"text": token, "confidence": None})
    # Also try pairwise joins ("AB12" + "CDE" -> "AB12CDE") so a plate split across
    # two text lines still matches.
    tokens = [t.strip() for t in re.split(r"\s+", text or "") if t.strip()]
    for a, b in zip(tokens, tokens[1:]):
        candidates.append({"text": a + b, "confidence": None})
    return candidates


def _content_type_for(image_bytes: bytes) -> str:
    """Best-effort image content-type from magic bytes (DI Read needs the right type)."""
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:2] == b"BM":
        return "image/bmp"
    if image_bytes[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    return "application/octet-stream"
