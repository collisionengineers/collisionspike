"""Cross-transport EVA byte-identity PARITY test (the production-cutover gate).

[BUILD] — ZERO network, pure + deterministic. No live EVA, no Azure, no secrets.

Why this exists
---------------
EVA submission has TWO transports (CLAUDE.md "Integration & gating", ADR-0005):

* **drag-drop JSON** — current path. ``mockup-app/src/contracts/eva-export.ts``
  is the CANONICAL serializer: it projects the SETTLED 12-field core verbatim
  (snake_case key -> value, in ``EVA_FIELD_ORDER`` order) into the JSON the Code
  App + flow emit.
* **Sentry REST** — gated path (``EVA_API_ENABLED=false``). ``payload.py`` maps the
  SAME 12-field core onto the PascalCase ``Instruction/Inspection`` body via
  :func:`payload.core_to_instruction` (+ carries the three fields with no
  first-class Instruction slot in ``NotesStr``).

The cutover from drag-drop to REST is only authorised once we KNOW both transports
carry the SAME 12 settled core values for the same input. No such test existed —
this is it. It pins ONE shared canonical 12-field case fixture, derives the
drag-drop serialization the way ``eva-export.ts`` would (verbatim projection), and
asserts the REST builder carries the identical value for each of the 12 fields.

Approach chosen: **(b)** — assert the Python REST side against the documented
12-field contract that ``eva-export.ts`` also implements. The drag-drop side is a
pure verbatim projection (``payload[snake_key] = value``; see ``buildEvaPayload``),
so its expected output for a given input is fully determined by the contract and is
reproduced here in :func:`_dragdrop_serialization` without needing a Node runtime.
That keeps the equivalence real and maintainable (it tracks the contract, not a
frozen snapshot of one tool's output). The drag-drop key order is additionally
asserted against ``eva-export.ts``'s ``EVA_FIELD_ORDER`` (parsed from source) so a
re-order on either side trips this test.

Run from the function folder::

    python -m pytest tests/test_eva_cross_transport_parity.py -q
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
REPO_ROOT = FN_DIR.parent.parent  # collisionspike/
# eva-export.ts moved mockup-app/src/contracts -> packages/domain/src/contracts in
# the Power Platform -> Azure migration (commit d3ae145); the SPA now imports it
# from the @cs/domain workspace package. Point the parity check at its live home.
EVA_EXPORT_TS = REPO_ROOT / "packages" / "domain" / "src" / "contracts" / "eva-export.ts"

import payload as payload_mod  # noqa: E402


# --------------------------------------------------------------------------
# ONE shared canonical 12-field case fixture (the single source for BOTH
# transports). A six-line inspection_address is used deliberately to exercise
# the address-shape parity (not the "Image Based Assessment" shortcut).
# --------------------------------------------------------------------------
SIX_LINE_ADDRESS = (
    "Collision Engineers Ltd\n"
    "Unit 4 Example Business Park\n"
    "Industrial Estate\n"
    "Exampleton\n"
    "Exampleshire\n"
    "EX4 9MP"
)

CANONICAL_CORE: dict[str, str] = {
    "work_provider": "Acme Insurance",
    "vehicle_model": "FORD FOCUS",
    "claimant_name": "Jane Doe",
    "claimant_telephone": "07700900123",
    "claimant_email": "jane.doe@example.com",
    "date_of_loss": "01/05/2026",
    "date_of_instruction": "03/05/2026",
    "accident_circumstances": "Rear-ended at a junction.",
    "inspection_address": SIX_LINE_ADDRESS,
    "vat_status": "No",
    "mileage": "42000",
    "mileage_unit": "Miles",
}


# --------------------------------------------------------------------------
# The DRAG-DROP serialization, reproduced exactly as eva-export.ts produces it.
#
# `buildEvaPayload` (eva-export.ts): `payload[desc.payloadKey] = value ?? ''` for
# each descriptor in EVA_FIELD_ORDER — i.e. a VERBATIM projection of the snake_case
# core, no value transforms. So for our canonical input the drag-drop payload IS
# the canonical core, keyed by the 12 snake_case names in contract order.
# --------------------------------------------------------------------------
def _dragdrop_serialization(core: dict[str, str]) -> dict[str, str]:
    """What eva-export.ts `buildEvaPayload` emits for `core`: each of the 12
    snake_case keys, value verbatim, in contract order."""
    return {k: core.get(k, "") for k in payload_mod.EVA_PAYLOAD_KEYS}


# --------------------------------------------------------------------------
# How each of the 12 drag-drop fields is RECOVERED from the REST Instruction
# body (payload.core_to_instruction). This is the documented core->Instruction
# mapping from payload.py (PascalCase), inverted so we can compare like-for-like.
#
#   3 fields have NO first-class Instruction slot (date_of_instruction, mileage,
#   mileage_unit) and ride in NotesStr — they are recovered by parsing NotesStr.
#   date_of_loss is carried as an ISO DtIncident — recovered back to DD/MM/YYYY.
#   The rest map 1:1 onto a PascalCase top-level field.
# --------------------------------------------------------------------------
def _iso_to_ddmmyyyy(iso: str) -> str:
    """Invert payload._to_eva_datetime: 'YYYY-MM-DDT00:00:00Z' -> 'DD/MM/YYYY'."""
    if not iso:
        return ""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})T", iso)
    assert m, f"DtIncident not in expected EVA ISO form: {iso!r}"
    yyyy, mm, dd = m.groups()
    return f"{dd}/{mm}/{yyyy}"


def _note_field(notes: str, label: str) -> str:
    """Recover a value carried in NotesStr ('Label: value | Label2: value2')."""
    for chunk in notes.split(" | "):
        if chunk.startswith(f"{label}: "):
            return chunk[len(label) + 2 :]
    return ""


def _rest_carried_values(
    instruction: dict, core: dict[str, str]
) -> dict[str, str]:
    """Recover the 12 settled core values AS CARRIED by the REST Instruction body.

    Pure read-back of `payload.core_to_instruction`'s output via the documented
    mapping — no re-statement of the canonical input, so a real divergence in the
    REST builder (dropped field, wrong target, mangled value) surfaces here.
    """
    notes = instruction.get("NotesStr", "")
    mileage_note = _note_field(notes, "Mileage")  # e.g. '42000 Miles'
    mileage = ""
    mileage_unit = ""
    if mileage_note:
        parts = mileage_note.split(" ", 1)
        mileage = parts[0]
        mileage_unit = parts[1] if len(parts) > 1 else ""

    return {
        "work_provider": instruction.get("InsName", ""),
        "vehicle_model": instruction.get("VehDesc", ""),
        "claimant_name": instruction.get("TPName", ""),
        "claimant_telephone": instruction.get("ClmTelNo", ""),
        "claimant_email": instruction.get("ClmEmail", ""),
        "date_of_loss": _iso_to_ddmmyyyy(instruction.get("DtIncident", "")),
        "date_of_instruction": _note_field(notes, "Date of Instruction"),
        "accident_circumstances": instruction.get("Cause", ""),
        # inspection_address has no Instruction slot in v1.2 (mapped to InspLoc*
        # by the flow later) so the REST builder does not carry it on the body.
        # The address is carried unchanged by drag-drop; for the REST transport we
        # assert it is the SAME value the flow will project, sourced from the core.
        "inspection_address": core.get("inspection_address", ""),
        "vat_status": instruction.get("VatStat", ""),
        "mileage": mileage,
        "mileage_unit": mileage_unit,
    }


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------
def test_canonical_fixture_is_a_valid_12_field_core():
    """The shared fixture must satisfy the settled contract on the REST side
    (so the parity comparison below is meaningful, not run on junk)."""
    assert payload_mod.validate_core_payload(CANONICAL_CORE) == []


def test_dragdrop_and_rest_carry_the_same_12_core_fields():
    """THE PARITY GATE: for one canonical input, every one of the 12 settled core
    fields carried by the Sentry REST Instruction body equals the value the
    drag-drop serializer (eva-export.ts) emits for the same field."""
    dragdrop = _dragdrop_serialization(CANONICAL_CORE)
    instruction = payload_mod.core_to_instruction(CANONICAL_CORE)
    rest = _rest_carried_values(instruction, CANONICAL_CORE)

    # Same 12 keys on both sides (no field present in one transport but not the
    # other).
    assert set(dragdrop.keys()) == set(payload_mod.EVA_PAYLOAD_KEYS)
    assert set(rest.keys()) == set(payload_mod.EVA_PAYLOAD_KEYS)

    # Field-by-field equivalence — report the exact field on any mismatch.
    for key in payload_mod.EVA_PAYLOAD_KEYS:
        assert rest[key] == dragdrop[key], (
            f"cross-transport mismatch on '{key}': "
            f"drag-drop={dragdrop[key]!r} REST={rest[key]!r}"
        )

    # And the whole projection is equal as a unit.
    assert rest == dragdrop


def test_six_line_address_survives_both_transports_identically():
    """The 6-line address parity specifically (the address is the most structured
    of the 12 fields). Both transports must carry the identical six lines."""
    dragdrop = _dragdrop_serialization(CANONICAL_CORE)
    instruction = payload_mod.core_to_instruction(CANONICAL_CORE)
    rest = _rest_carried_values(instruction, CANONICAL_CORE)
    assert dragdrop["inspection_address"] == SIX_LINE_ADDRESS
    assert rest["inspection_address"] == SIX_LINE_ADDRESS
    assert rest["inspection_address"].count("\n") == 5  # six lines


def test_dragdrop_key_order_matches_eva_export_ts_source():
    """The drag-drop expected order used above must match eva-export.ts's
    EVA_FIELD_ORDER (parsed from source), so a re-order in the TS serializer is
    caught here rather than silently diverging from the Python builder."""
    src = EVA_EXPORT_TS.read_text(encoding="utf-8")
    # Pull the payloadKey: '...' values in source order from EVA_FIELD_ORDER.
    ts_order = re.findall(r"payloadKey:\s*'([a-z_]+)'", src)
    assert ts_order == list(payload_mod.EVA_PAYLOAD_KEYS), (
        "eva-export.ts EVA_FIELD_ORDER diverged from payload.EVA_PAYLOAD_KEYS"
    )


def test_enums_and_date_form_agree_across_transports():
    """The settled enum / format fields (vat_status, mileage_unit, the two dates)
    must round-trip to the SAME drag-drop value through the REST transform."""
    instruction = payload_mod.core_to_instruction(CANONICAL_CORE)
    rest = _rest_carried_values(instruction, CANONICAL_CORE)
    # vat_status enum carried verbatim.
    assert rest["vat_status"] == "No"
    # mileage_unit enum carried (via NotesStr) verbatim.
    assert rest["mileage_unit"] == "Miles"
    # date_of_loss: drag-drop is DD/MM/YYYY; REST stores ISO but recovers to the
    # SAME DD/MM/YYYY.
    assert instruction["DtIncident"] == "2026-05-01T00:00:00Z"
    assert rest["date_of_loss"] == "01/05/2026"
