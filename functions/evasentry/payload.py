"""EVA Instruction/Inspection payload builder + 12-field core validation.

[BUILD] — pure, deterministic, framework-free (no HTTP, no Azure). Exercised by
``pytest`` only.

Contract alignment
------------------
The **12-field core** is the SAME settled contract the Code App serializer
(``mockup-app/src/contracts/eva-export.ts``) and the Python parser
(``cedocumentmapper_v2.0``) target, validated against
``contracts/eva-payload.schema.json``. To keep the deployment package
self-contained (the repo-root ``contracts/`` dir does not ship in the Function
zip — see ``.funcignore``), the 12-key order + the membership/format rules are
embedded here as ``EVA_PAYLOAD_KEYS`` + ``validate_core_payload`` and a parity
test (``tests/test_payload.py``) asserts they match the repo-root schema
byte-for-byte. **The schema is the authority; this module must track it.**

The ``Instruction/Inspection`` API body is RICHER than the 12-field core:
vehicle/claim identity, multiple postcodes, claim type, ``DamageType[1..3]``,
estimate/cost fields, and base-64 **Impact Image** entries EVA renders into the
report PDF. The exact PascalCase field names live ONLY in
``docs/reference/Sentry API Documentation 1.2 Amended.pdf`` and must be confirmed
against the EVA **test** server before the connector is finalised (plan §13 Q1).
Until then this builder emits the **schema-valid 12-field core verbatim** (so the
REST body and the drag-drop body are byte-identical for those 12) and attaches
the ordered Impact Images under a clearly-marked, easily-renamed key.
"""

from __future__ import annotations

import re
from typing import Any

# --- The 12 settled snake_case payload keys, in contract order. --------------
# MUST equal contracts/eva-payload.schema.json `propertyNames.enum` (asserted by
# tests/test_payload.py). Order is load-bearing (the drag-drop producers all
# serialise in this order).
EVA_PAYLOAD_KEYS: tuple[str, ...] = (
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

# Required non-empty fields (schema `required` set is all 12 keys present, but
# only these two are minLength>=1 in the schema; the readiness gate lives in the
# evavalidation Function, not here).
_REQUIRED_NONEMPTY = ("work_provider", "vehicle_model")

_DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})?$")
_MILEAGE_RE = re.compile(r"^\d*$")
_ADDRESS_SIX_LINES_RE = re.compile(r"^[^\n]*(\n[^\n]*){5}$")
_VAT_ENUM = ("", "Yes", "No")
_MILEAGE_UNIT_ENUM = ("", "Miles", "Km")


def validate_core_payload(core: dict[str, Any]) -> list[str]:
    """Validate the 12-field core against the embedded contract rules.

    Returns a list of human-readable error strings (empty = valid). Mirrors
    ``contracts/eva-payload.schema.json``: exactly these 12 keys, each a string;
    date fields ``DD/MM/YYYY`` or empty; ``vat_status`` ∈ {"",Yes,No};
    ``mileage`` digits-only; ``mileage_unit`` ∈ {"",Miles,Km}; inspection_address
    is six newline-separated lines OR the literal ``Image Based Assessment``;
    ``work_provider``/``vehicle_model`` non-empty.
    """
    errors: list[str] = []

    if not isinstance(core, dict):
        return ["payload must be a JSON object"]

    keys = set(core.keys())
    expected = set(EVA_PAYLOAD_KEYS)
    missing = expected - keys
    extra = keys - expected
    for k in sorted(missing):
        errors.append(f"missing required field '{k}'")
    for k in sorted(extra):
        errors.append(f"unexpected field '{k}'")

    for k in EVA_PAYLOAD_KEYS:
        if k in core and not isinstance(core[k], str):
            errors.append(f"field '{k}' must be a string")

    # Field-level format rules (only when present and a string).
    def _s(key: str) -> str | None:
        v = core.get(key)
        return v if isinstance(v, str) else None

    for key in _REQUIRED_NONEMPTY:
        v = _s(key)
        if v is not None and len(v.strip()) == 0:
            errors.append(f"field '{key}' is required (non-empty)")

    for key in ("date_of_loss", "date_of_instruction"):
        v = _s(key)
        if v is not None and not _DATE_RE.match(v):
            errors.append(f"field '{key}' must be DD/MM/YYYY or empty")

    v = _s("vat_status")
    if v is not None and v not in _VAT_ENUM:
        errors.append("field 'vat_status' must be one of '', 'Yes', 'No'")

    v = _s("mileage")
    if v is not None and not _MILEAGE_RE.match(v):
        errors.append("field 'mileage' must be digits only or empty")

    v = _s("mileage_unit")
    if v is not None and v not in _MILEAGE_UNIT_ENUM:
        errors.append("field 'mileage_unit' must be one of '', 'Miles', 'Km'")

    v = _s("inspection_address")
    if v is not None and v != "Image Based Assessment" and not _ADDRESS_SIX_LINES_RE.match(v):
        errors.append(
            "field 'inspection_address' must be six newline-separated lines "
            "or the literal 'Image Based Assessment'"
        )

    return errors


def order_impact_images(
    images: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return Impact Images in EVA upload order: **2 previews first, then the
    full sequence including those two again** (skill / domain rule).

    Each input image is a dict with at least ``{ "sequenceIndex": int }`` and a
    base-64 ``"content"`` (plus optional ``"role"``, ``"filename"``). The flow
    already orders accepted, non-excluded Evidence by ``sequenceindex asc`` and
    seeds the 2 previews at index 0,1; this helper is the **server-side
    authority** for the same ordering so the Function is correct even if called
    with an unordered array.

    Ordering produced (indices 0,1 = the previews):
        [ preview0, preview1, img0, img1, img2, ... ]
    i.e. the two previews are emitted, then the FULL sequence (which itself
    starts with those same two previews) — matching "all photos in sequence,
    including those two again".

    NOTE: the exact API shape (separate ``SubmitPreviews`` call vs a single
    ordered array on ``Instruction/Inspection``) is unconfirmed against the EVA
    test env (plan §13 Q1). This returns the ordered list; the handler decides
    how to attach it.
    """
    ordered = sorted(images, key=lambda im: _seq(im))
    if len(ordered) < 2:
        # Cannot form the 2-preview prefix; return as-is (readiness gate elsewhere
        # already requires >=2 accepted images).
        return list(ordered)
    previews = ordered[:2]
    return [*previews, *ordered]


def _seq(image: dict[str, Any]) -> int:
    raw = image.get("sequenceIndex")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 1_000_000  # unsequenced images sort last


def build_instruction_inspection(
    core: dict[str, Any],
    *,
    images: list[dict[str, Any]] | None = None,
    case_po: str | None = None,
) -> dict[str, Any]:
    """Assemble the Instruction/Inspection request body.

    * ``core`` — the validated 12-field snake_case core (emitted VERBATIM so the
      REST body and the drag-drop body are byte-identical for those 12).
    * ``images`` — optional ordered Impact Image entries; ordered here by
      :func:`order_impact_images`.
    * ``case_po`` — the lowercase Case/PO (EVA uses lowercase; Box uses
      UPPERCASE — handled by the flow, not here).

    The image entries are attached under ``impact_images`` — a clearly-marked,
    easily-renamed key. **Rename to the real PascalCase Impact-Image field(s)
    once confirmed against the EVA test server (plan §13 Q1).**
    """
    body: dict[str, Any] = dict(core)  # copy; preserve the 12-field core order
    if case_po:
        body["case_po"] = case_po
    if images:
        body["impact_images"] = order_impact_images(images)
    return body
