"""EVA Instruction/Inspection payload builder + 12-field core validation.

[BUILD] — pure, deterministic, framework-free (no HTTP, no Azure). Exercised by
``pytest`` only.

Contract alignment
------------------
The twelve-field core is the settled contract the web serializer and Python
parser target, validated against
``contracts/eva-payload.schema.json``. To keep the deployment package
self-contained (the repo-root ``contracts/`` dir does not ship in the Function
zip — see ``.funcignore``), the 12-key order + the membership/format rules are
embedded here as ``EVA_PAYLOAD_KEYS`` + ``validate_core_payload`` and a parity
test (``tests/test_evasentry.py``) asserts they match the repo-root schema
byte-for-byte. **The schema is the authority; this module must track it.**

The Sentry REST ``Instruction/Inspection`` API body is RICHER than the 12-field
core. Confirmed against ``docs/reference/Sentry API Documentation 1.2
Amended.pdf`` (re-read 2026-06-18, pp.5-13):

* Top-level fields are **PascalCase** (``RequestFrom``, ``ExternalRef``,
  ``VehReg``, ``ClmNo``, ``InsName``, ``VehDesc``, ``Cause``, ``VatStat``,
  ``ClmTelNo``, ``ClmEmail``, ``DtIncident``, ``InstEmail`` …). The 12 settled
  snake_case fields map onto a subset of these (:func:`core_to_instruction`).
* Photos/documents ride INLINE in a ``Files`` array of
  ``{ "Name", "Extension", "Data"(base64) }`` (p.13 example) — **not** under an
  ``impact_images`` key. (``ImpactImage`` in this API is the directional
  impact-diagram Start/End list on ``/Report/SubmitReport`` (pp.49,58-60) and is
  unrelated to photo submission — a prior naming slip, now corrected.)

Two-request photo submission (the domain rule, p.13 + pp.21-23)
---------------------------------------------------------------
The manual EVA process and the API both require: upload the **2 preview photos
first** (vehicle **overview** with the full registration visible + main-damage
**closeup**), **then all photos in sequence including those two again**. With the
REST surface this is realised as **two requests** to the same claim:

1. ``POST /Instruction/Inspection`` carrying the **2 preview** Files (and the
   12-field core mapped to PascalCase). The 200 response returns an ``Id`` /
   ``EvaRef`` for the new claim.
2. ``POST /Note/SubmitNote`` (matches the claim by ``ClmNo`` + ``VehReg``)
   carrying **all** photos in sequence — which already begins with those same two
   previews — so EVA ends up with: previews, then the full ordered set incl. the
   previews again.

The split is produced by :func:`split_preview_and_rest`; the file entries by
:func:`build_files`; the Instruction body by :func:`core_to_instruction`. The
handler (``function_app.py``) drives the two requests with a single bearer token.
"""

from __future__ import annotations

import re
from typing import Any

# --- The 12 settled snake_case payload keys, in contract order. --------------
# MUST equal contracts/eva-payload.schema.json `propertyNames.enum` (asserted by
# tests/test_evasentry.py). Order is load-bearing (the drag-drop producers all
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
# only these two are minLength>=1 in the schema; complete case readiness is
# enforced by the shared domain contract and Data API before this adapter runs).
_REQUIRED_NONEMPTY = ("work_provider", "vehicle_model")

_DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})?$")
_MILEAGE_RE = re.compile(r"^\d*$")
_ADDRESS_SIX_LINES_RE = re.compile(r"^[^\n]*(\n[^\n]*){5}$")
_VAT_ENUM = ("", "Yes", "No")
_MILEAGE_UNIT_ENUM = ("", "Miles", "Km")

# How many leading images form the EVA "preview" prefix (overview + damage
# closeup). The shared domain readiness rule already requires at least two.
PREVIEW_COUNT = 2


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


# --------------------------------------------------------------------------
# Image ordering / preview split (the two-request photo rule)
# --------------------------------------------------------------------------

def _seq(image: dict[str, Any]) -> int:
    raw = image.get("sequenceIndex")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 1_000_000  # unsequenced images sort last


def sort_images(images: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the images sorted by ``sequenceIndex`` ascending (stable).

    The orchestration caller already orders accepted, non-excluded evidence by ``sequenceIndex``
    and seeds the 2 previews at index 0,1; this is the **server-side authority**
    for the same ordering so the Function is correct even if called with an
    unordered array.
    """
    return sorted(images, key=_seq)


def split_preview_and_rest(
    images: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split sorted images into ``(previews, all_in_sequence)`` for the two
    EVA requests.

    * ``previews`` — the first :data:`PREVIEW_COUNT` images (overview +
      damage-closeup), uploaded on ``Instruction/Inspection``.
    * ``all_in_sequence`` — **every** image in ascending sequence (which itself
      begins with those previews), uploaded on ``Note/SubmitNote`` — so EVA ends
      up with "the 2 previews first, then all photos including those two again".

    If fewer than :data:`PREVIEW_COUNT` images are supplied the previews list is
    whatever exists and the rest is the full (sorted) list; the submission
    readiness gate blocks a case with fewer than two accepted images, so this is
    defence-in-depth, not the primary check.
    """
    ordered = sort_images(images)
    previews = ordered[:PREVIEW_COUNT]
    return previews, ordered


# --------------------------------------------------------------------------
# Registration-visible guard (overview must show the full registration)
# --------------------------------------------------------------------------

def overview_registration_warnings(images: list[dict[str, Any]]) -> list[str]:
    """Advisory checks that the preview prefix carries a valid **overview**.

    The domain rule (skill ``eva-sentry-api``; image-rules.ts): the first preview
    must be a vehicle **overview** whose **full registration is visible**. We
    cannot inspect the registration here, so we trust the upstream classification
    flags and surface a warning when:

    * there is no image tagged ``role == "overview"`` in the preview prefix, or
    * the chosen overview is explicitly flagged ``registrationVisible == False``.

    Returns a list of warning strings (empty = no concern raised).
    """
    warnings: list[str] = []
    previews, _ = split_preview_and_rest(images)
    if not previews:
        return ["no preview images supplied (need an overview + damage closeup)"]

    overview = next(
        (im for im in previews if str(im.get("role", "")).lower() == "overview"),
        None,
    )
    if overview is None:
        warnings.append(
            "no preview image is tagged role='overview'; EVA requires the first "
            "preview to be a vehicle overview with the full registration visible"
        )
        # Fall back to the first preview for the registration-visible check.
        overview = previews[0]

    if overview.get("registrationVisible") is False:
        warnings.append(
            "the overview preview is flagged registrationVisible=false; the "
            "registration must be fully visible in the overview photo"
        )
    return warnings


# --------------------------------------------------------------------------
# EVA File entries + the core->Instruction PascalCase mapping
# --------------------------------------------------------------------------

def _extension_of(image: dict[str, Any]) -> str:
    """Derive an EVA File ``Extension`` ("".jpg"/".pdf"/…) from the image's
    filename, defaulting to ``.jpg``. EVA's example uses a leading dot."""
    name = str(image.get("filename") or "")
    m = re.search(r"(\.[A-Za-z0-9]{1,8})$", name)
    if m:
        return m.group(1).lower()
    return ".jpg"


def _file_name_of(image: dict[str, Any], index: int) -> str:
    name = str(image.get("filename") or "").strip()
    if name:
        return name
    role = str(image.get("role") or "image").lower()
    return f"{role}_{index + 1}{_extension_of(image)}"


def build_files(images: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map image entries to EVA ``Files`` entries ``{Name, Extension, Data}``.

    ``Data`` is the base-64 content the caller supplies under ``content``. Images
    without ``content`` are skipped (a metadata-only Evidence row can't be sent).
    Order is preserved (the caller sorts first).
    """
    files: list[dict[str, Any]] = []
    for i, im in enumerate(images):
        data = im.get("content")
        if not isinstance(data, str) or not data:
            continue
        files.append(
            {
                "Name": _file_name_of(im, i),
                "Extension": _extension_of(im),
                "Data": data,
            }
        )
    return files


# The 12 snake_case core fields -> the PascalCase Instruction/Inspection fields
# they populate (Sentry API v1.2, pp.5-12). Empty target => not carried.
#   work_provider          -> InsName       (Name of the insurer / work provider)
#   vehicle_model          -> VehDesc       (Vehicle description)
#   claimant_name          -> TPName        (claimant / third-party name)
#   claimant_telephone     -> ClmTelNo      (Claim contact number)
#   claimant_email         -> ClmEmail      (Email of claim contact)
#   date_of_loss           -> DtIncident    (Date of the incident; DD/MM/YYYY in)
#   date_of_instruction    -> (no direct field; carried in NotesStr provenance)
#   accident_circumstances -> Cause         (Cause of incident)
#   inspection_address     -> InspLocName/Add/Town/City/County/PCode
#   vat_status             -> VatStat       (VAT status; Yes/No/n%)
#   mileage / mileage_unit -> (no Instruction field; carried in NotesStr)
def core_to_instruction(
    core: dict[str, Any],
    *,
    files: list[dict[str, Any]] | None = None,
    external_ref: str | None = None,
    request_from: str | None = None,
    veh_reg: str | None = None,
    clm_no: str | None = None,
) -> dict[str, Any]:
    """Map the validated 12-field core to a Sentry ``Instruction/Inspection``
    request body (PascalCase), attaching ``Files`` for the preview photos.

    Identity helpers (``external_ref`` = Case/PO, ``veh_reg``, ``clm_no``) are
    passed by the orchestration caller; ``request_from`` is the EVA-supplied
    contact code (a non-secret app setting ``EVA_REQUEST_FROM`` /
    ``[RESERVED-FOR-USER]``). Only non-empty values are emitted so EVA sees a
    clean body.

    ``date_of_instruction``, ``mileage`` and ``mileage_unit`` have no first-class
    Instruction field in v1.2; they are preserved in ``NotesStr`` so no datum is
    silently dropped (re-home them if EVA adds fields — plan §13 Q1).
    """
    out: dict[str, Any] = {}

    def put(key: str, value: Any) -> None:
        if isinstance(value, str):
            value = value.strip()
        if value not in (None, ""):
            out[key] = value

    put("RequestFrom", request_from)
    put("ExternalRef", external_ref)
    put("VehReg", veh_reg)
    put("ClmNo", clm_no)

    put("InsName", core.get("work_provider"))
    put("VehDesc", core.get("vehicle_model"))
    put("TPName", core.get("claimant_name"))
    put("ClmTelNo", core.get("claimant_telephone"))
    put("ClmEmail", core.get("claimant_email"))
    put("Cause", core.get("accident_circumstances"))

    for key, value in _inspection_location_fields(core.get("inspection_address")).items():
        put(key, value)
    put("InspType", "Vehicle Damage Inspection")

    dol = _to_eva_datetime(core.get("date_of_loss"))
    put("DtIncident", dol)

    put("VatStat", _vat_to_eva(core.get("vat_status")))

    notes = _provenance_notes(core)
    put("NotesStr", notes)

    if files:
        out["Files"] = files
    return out


def _inspection_location_fields(value: Any) -> dict[str, str]:
    """Map the canonical six-line address to the Sentry v1.2 inspection fields.

    The settled core fixes the line order as name, address, town, city, county,
    postcode. ``Image Based Assessment`` is an explicit staff choice, so it is
    retained as the location name and no fabricated address parts are emitted.
    """
    if not isinstance(value, str) or not value:
        return {}
    if value == "Image Based Assessment":
        return {"InspLocName": value}
    lines = value.split("\n")
    if len(lines) != 6:
        return {}
    keys = (
        "InspLocName",
        "InspLocAdd",
        "InspLocTown",
        "InspLocCity",
        "InspLocCounty",
        "InspLocPCode",
    )
    return dict(zip(keys, lines, strict=True))


def _vat_to_eva(value: Any) -> str:
    """Core VatStatus ∈ {"",Yes,No} maps straight onto EVA VatStat (which also
    accepts ``n%`` we never emit). Empty stays empty (omitted by ``put``)."""
    if value in ("Yes", "No"):
        return value
    return ""


def _to_eva_datetime(ddmmyyyy: Any) -> str:
    """Convert a ``DD/MM/YYYY`` core date to the EVA ``DateTime`` ISO form used in
    the Instruct example (``2025-10-15T00:00:00Z``). Empty/invalid -> ""."""
    if not isinstance(ddmmyyyy, str) or not _DATE_RE.match(ddmmyyyy) or ddmmyyyy == "":
        return ""
    dd, mm, yyyy = ddmmyyyy.split("/")
    return f"{yyyy}-{mm}-{dd}T00:00:00Z"


def _provenance_notes(core: dict[str, Any]) -> str:
    """Carry the core fields that have no first-class Instruction slot
    (date_of_instruction, mileage, mileage_unit) into NotesStr so nothing is
    dropped. Deterministic, single line."""
    bits: list[str] = []
    doi = (core.get("date_of_instruction") or "").strip() if isinstance(core.get("date_of_instruction"), str) else ""
    if doi:
        bits.append(f"Date of Instruction: {doi}")
    mileage = (core.get("mileage") or "").strip() if isinstance(core.get("mileage"), str) else ""
    unit = (core.get("mileage_unit") or "").strip() if isinstance(core.get("mileage_unit"), str) else ""
    if mileage:
        bits.append(f"Mileage: {mileage}{(' ' + unit) if unit else ''}")
    return " | ".join(bits)


def build_note_submitnote(
    *,
    files: list[dict[str, Any]],
    clm_no: str | None = None,
    veh_reg: str | None = None,
    eva_ref: str | None = None,
    note: str = "Full photo set (preview photos repeated in sequence).",
) -> dict[str, Any]:
    """Assemble the second-request ``Note/SubmitNote`` body carrying the full
    ordered photo set.

    EVA matches the target claim by **ClmNo + VehReg** OR **EvaRef + VehReg**
    (PDF pp.22-23). We send whatever identity we have; ``VehReg`` is the common
    key. ``Files`` is the full ordered set (previews + all).
    """
    body: dict[str, Any] = {"Note": note, "Files": files}
    if clm_no:
        body["ClmNo"] = clm_no
    if veh_reg:
        body["VehReg"] = veh_reg
    if eva_ref:
        body["EvaRef"] = eva_ref
    return body
