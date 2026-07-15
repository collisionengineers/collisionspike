"""Offline tests for the EVA Sentry REST submission wrapper.

[BUILD] — ZERO network. The EVA ``/Connect/token``, ``/Instruction/Inspection``
and ``/Note/SubmitNote`` endpoints are mocked with respx (httpx transport
mocking). No live EVA, no Azure, no real secrets.

Run from the function folder:

    python -m pytest -q

Covered:
* The 12-field core is validated BEFORE any token is minted (a malformed payload
  never reaches EVA).
* Token mint: ``expires_in`` (MINUTES) is converted to a seconds TTL with the 30s
  skew; a second call inside the window does NOT re-mint; ONE mint covers both the
  instruction and the note (the second photo request).
* A 401 on ``/Instruction/Inspection`` refreshes the token exactly once, then
  retries and succeeds.
* A persistent 401 / EVA error soft-fails (submitted=false + warning) — no
  exception bubbles, so the flow can fall back to drag-drop.
* Two-request photo submission: 2 previews on Instruction (as ``Files``), then ALL
  photos in sequence (incl. those two again) on ``Note/SubmitNote`` matched by
  VehReg/ClmNo. A failed note degrades to a warning (instruction still accepted).
* The overview must show the full registration (advisory warnings).
* core -> PascalCase Instruction mapping (InsName/VehDesc/Cause/VatStat/…).
* Idempotency by payload hash: a repeat short-circuits (no second EVA submit).
* The client_secret / client_id / bearer token never appear in logs or response.
* ``EVA_PAYLOAD_KEYS`` matches ``contracts/eva-payload.schema.json`` byte-for-byte
  (the cross-language contract parity gate).
* HTTP handler edges (gate off -> 200 submitted=false; bad body -> 400; invalid
  core -> 400; end-to-end happy path -> 200 submitted=true) — built without
  ``func start``.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

import httpx
import pytest
import respx

# Make the function modules importable when pytest runs from anywhere.
FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))
FIXTURES = Path(__file__).resolve().parent / "fixtures"
REPO_ROOT = FN_DIR.parents[2]

from eva_client import EvaClient, EvaConfig, EvaAuthError  # noqa: E402
import function_app  # noqa: E402
import payload as payload_mod  # noqa: E402

EVA_BASE = "https://eva.test.example/api/"
TOKEN_URL = f"{EVA_BASE}Connect/token"
INSTRUCTION_URL = f"{EVA_BASE}Instruction/Inspection"
NOTE_URL = f"{EVA_BASE}Note/SubmitNote"

# Recognisable fake secrets so we can assert they are never leaked.
FAKE_CLIENT_ID = "FAKE-eva-client-id-1234567890"  # noqa: S105 - test-only
FAKE_SECRET = "sBx+fake/eva-secret+VALUE=="  # noqa: S105 - test-only
FAKE_TOKEN = "FAKE.test.eva-access-token.not-a-real-jwt"  # from token_response.json


@pytest.fixture(autouse=True)
def _reset_idempotency():
    """Isolate the in-process idempotency cache between tests (it is a module
    global; production ages it out on worker recycle)."""
    function_app.clear_idempotency_cache()
    yield
    function_app.clear_idempotency_cache()


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _eva_client() -> EvaClient:
    cfg = EvaConfig(client_id=FAKE_CLIENT_ID, client_secret=FAKE_SECRET, base_url=EVA_BASE)
    return EvaClient(config=cfg)


def _mock_token() -> respx.Route:
    return respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json=_load("token_response.json"))
    )


def _mock_instruction() -> respx.Route:
    return respx.post(INSTRUCTION_URL).mock(
        return_value=httpx.Response(200, json=_load("instruction_response.json"))
    )


def _mock_note() -> respx.Route:
    return respx.post(NOTE_URL).mock(
        return_value=httpx.Response(200, json=_load("note_response.json"))
    )


def _valid_core() -> dict:
    return _load("core_payload_valid.json")


# --------------------------------------------------------------------------
# 12-field core validation (contract gate)
# --------------------------------------------------------------------------

def test_valid_core_passes_validation():
    assert payload_mod.validate_core_payload(_valid_core()) == []


def test_missing_required_field_fails():
    core = _valid_core()
    del core["work_provider"]
    errors = payload_mod.validate_core_payload(core)
    assert any("work_provider" in e for e in errors)


def test_empty_required_field_fails():
    core = _valid_core()
    core["vehicle_model"] = "   "
    errors = payload_mod.validate_core_payload(core)
    assert any("vehicle_model" in e for e in errors)


def test_unexpected_field_fails():
    core = _valid_core()
    core["vrm"] = "AB12CDE"  # vrm is Case-identity, NOT a payload field
    errors = payload_mod.validate_core_payload(core)
    assert any("vrm" in e for e in errors)


def test_bad_date_format_fails():
    core = _valid_core()
    core["date_of_loss"] = "2026-05-01"  # wrong format (needs DD/MM/YYYY)
    errors = payload_mod.validate_core_payload(core)
    assert any("date_of_loss" in e for e in errors)


def test_bad_vat_enum_fails():
    core = _valid_core()
    core["vat_status"] = "Maybe"
    errors = payload_mod.validate_core_payload(core)
    assert any("vat_status" in e for e in errors)


def test_non_digit_mileage_fails():
    core = _valid_core()
    core["mileage"] = "42,000"
    errors = payload_mod.validate_core_payload(core)
    assert any("mileage" in e for e in errors)


def test_six_line_address_passes():
    core = _valid_core()
    core["inspection_address"] = "Line1\nLine2\nLine3\nLine4\nLine5\nLine6"
    assert payload_mod.validate_core_payload(core) == []


def test_five_line_address_fails():
    core = _valid_core()
    core["inspection_address"] = "Line1\nLine2\nLine3\nLine4\nLine5"
    errors = payload_mod.validate_core_payload(core)
    assert any("inspection_address" in e for e in errors)


def test_submit_blocks_eva_on_invalid_core():
    # An invalid core must NOT contact EVA (no respx routes registered -> any
    # call would raise). submit() returns submitted=false with errors.
    core = _valid_core()
    del core["claimant_name"]
    result = function_app.submit(core, client=_eva_client())
    assert result["submitted"] is False
    assert any("claimant_name" in w for w in result["warnings"])


# --------------------------------------------------------------------------
# Token lifecycle
# --------------------------------------------------------------------------

@respx.mock
def test_token_minted_and_cached(monkeypatch):
    token_route = _mock_token()
    client = _eva_client()
    t1 = client.get_token()
    t2 = client.get_token()  # within the window -> no re-mint
    assert t1 == t2 == FAKE_TOKEN
    assert token_route.call_count == 1


@respx.mock
def test_token_expiry_minutes_to_seconds(monkeypatch):
    # expires_in=5 (MINUTES) -> deadline ~ now + 5*60 - 30s. Pin monotonic so the
    # conversion is asserted deterministically.
    base = 1_000.0
    monkeypatch.setattr(time, "monotonic", lambda: base)
    _mock_token()
    client = _eva_client()
    client.get_token()
    cached = client._token
    assert cached is not None
    # 5 minutes = 300s, minus 30s skew = 270s after `base`.
    assert cached.expires_at_monotonic == pytest.approx(base + 270.0)


@respx.mock
def test_one_token_mint_covers_instruction_and_note():
    # Two-request submission must reuse the SAME bearer: exactly one /Connect/token.
    token_route = _mock_token()
    instr = _mock_instruction()
    note = _mock_note()
    images = [
        {"sequenceIndex": 0, "content": "p0", "role": "overview", "registrationVisible": True},
        {"sequenceIndex": 1, "content": "p1", "role": "damage_closeup"},
        {"sequenceIndex": 2, "content": "c2"},
    ]
    result = function_app.submit(
        _valid_core(), images=images, vrm="AB12CDE", clm_no="CLM1", client=_eva_client()
    )
    assert result["submitted"] is True
    assert token_route.call_count == 1
    assert instr.call_count == 1
    assert note.call_count == 1


@respx.mock
def test_401_refreshes_token_once_then_succeeds(monkeypatch, caplog):
    token_route = _mock_token()
    calls = {"n": 0}

    def instruction_handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(401)  # stale token
        return httpx.Response(200, json=_load("instruction_response.json"))

    respx.post(INSTRUCTION_URL).mock(side_effect=instruction_handler)

    with caplog.at_level(logging.WARNING):
        result = function_app.submit(_valid_core(), client=_eva_client())

    assert result["submitted"] is True
    assert result.get("evaRef") == "TEST26001-EVA"
    assert token_route.call_count >= 2  # initial + forced refresh
    assert calls["n"] == 2  # one 401, one success
    assert FAKE_TOKEN not in caplog.text
    assert FAKE_SECRET not in caplog.text


@respx.mock
def test_persistent_401_soft_fails():
    _mock_token()
    respx.post(INSTRUCTION_URL).mock(return_value=httpx.Response(401))
    result = function_app.submit(_valid_core(), client=_eva_client())
    assert result["submitted"] is False
    assert any("manual review" in w or "failed" in w for w in result["warnings"])


@respx.mock
def test_eva_500_soft_fails():
    _mock_token()
    respx.post(INSTRUCTION_URL).mock(return_value=httpx.Response(500))
    result = function_app.submit(_valid_core(), client=_eva_client())
    assert result["submitted"] is False


def test_token_auth_error_on_bad_creds():
    @respx.mock
    def run():
        respx.post(TOKEN_URL).mock(return_value=httpx.Response(401))
        with pytest.raises(EvaAuthError):
            _eva_client().get_token()

    run()


# --------------------------------------------------------------------------
# Image ordering + preview split (2 previews first, then full sequence)
# --------------------------------------------------------------------------

def test_split_preview_and_rest():
    images = [
        {"sequenceIndex": 2, "content": "c2"},
        {"sequenceIndex": 0, "content": "p0"},
        {"sequenceIndex": 1, "content": "p1"},
        {"sequenceIndex": 3, "content": "c3"},
    ]
    previews, all_in_seq = payload_mod.split_preview_and_rest(images)
    assert [im["content"] for im in previews] == ["p0", "p1"]
    # the full sequence begins with the previews and continues in order.
    assert [im["content"] for im in all_in_seq] == ["p0", "p1", "c2", "c3"]


def test_split_single_image_no_full_prefix():
    images = [{"sequenceIndex": 0, "content": "only"}]
    previews, all_in_seq = payload_mod.split_preview_and_rest(images)
    assert previews == images
    assert all_in_seq == images


def test_build_files_shapes_name_extension_data():
    images = [
        {"sequenceIndex": 0, "content": "AAA=", "filename": "overview.JPG"},
        {"sequenceIndex": 1, "content": "BBB=", "role": "damage_closeup"},
        {"sequenceIndex": 2, "content": "", "filename": "skipme.jpg"},  # no data -> skipped
    ]
    files = payload_mod.build_files(images)
    assert len(files) == 2
    assert files[0] == {"Name": "overview.JPG", "Extension": ".jpg", "Data": "AAA="}
    # role-derived name + default extension when no filename
    assert files[1]["Name"] == "damage_closeup_2.jpg"
    assert files[1]["Extension"] == ".jpg"
    assert files[1]["Data"] == "BBB="


# --------------------------------------------------------------------------
# core -> Instruction PascalCase mapping
# --------------------------------------------------------------------------

def test_core_to_instruction_pascalcase_mapping():
    core = _valid_core()
    files = [{"Name": "a.jpg", "Extension": ".jpg", "Data": "AAA="}]
    body = payload_mod.core_to_instruction(
        core, files=files, external_ref="test26001", veh_reg="AB12CDE", clm_no="CLM1",
        request_from="CECODE",
    )
    assert body["InsName"] == "Acme Insurance"        # work_provider
    assert body["VehDesc"] == "FORD FOCUS"            # vehicle_model
    assert body["TPName"] == "Jane Doe"               # claimant_name
    assert body["ClmTelNo"] == "07700900123"          # claimant_telephone
    assert body["ClmEmail"] == "jane.doe@example.com"  # claimant_email
    assert body["Cause"] == "Rear-ended at a junction."  # accident_circumstances
    assert body["VatStat"] == "No"                    # vat_status
    assert body["DtIncident"] == "2026-05-01T00:00:00Z"  # date_of_loss DD/MM/YYYY -> ISO
    assert body["InspLocName"] == "Image Based Assessment"
    assert body["InspType"] == "Vehicle Damage Inspection"
    assert body["VehReg"] == "AB12CDE"
    assert body["ClmNo"] == "CLM1"
    assert body["ExternalRef"] == "test26001"
    assert body["RequestFrom"] == "CECODE"
    assert body["Files"] == files
    # date_of_instruction / mileage carried in NotesStr (no first-class field).
    assert "03/05/2026" in body["NotesStr"]
    assert "42000" in body["NotesStr"]


def test_core_to_instruction_omits_empty_values():
    core = _valid_core()
    core["claimant_email"] = ""
    core["vat_status"] = ""
    body = payload_mod.core_to_instruction(core)
    assert "ClmEmail" not in body
    assert "VatStat" not in body  # empty VAT is omitted, not sent as ""


def test_core_to_instruction_maps_six_line_inspection_address():
    core = _valid_core()
    core["inspection_address"] = "Repairer name\n1 Test Road\nWatford\nLondon\nHertfordshire\nWD17 1AA"
    body = payload_mod.core_to_instruction(core)
    assert {
        key: body[key]
        for key in (
            "InspLocName", "InspLocAdd", "InspLocTown", "InspLocCity",
            "InspLocCounty", "InspLocPCode",
        )
    } == {
        "InspLocName": "Repairer name",
        "InspLocAdd": "1 Test Road",
        "InspLocTown": "Watford",
        "InspLocCity": "London",
        "InspLocCounty": "Hertfordshire",
        "InspLocPCode": "WD17 1AA",
    }


def test_build_note_targets_claim_by_vehreg_clmno():
    files = [{"Name": "a.jpg", "Extension": ".jpg", "Data": "AAA="}]
    note = payload_mod.build_note_submitnote(files=files, clm_no="CLM1", veh_reg="AB12CDE")
    assert note["ClmNo"] == "CLM1"
    assert note["VehReg"] == "AB12CDE"
    assert note["Files"] == files
    assert isinstance(note["Note"], str) and note["Note"]


# --------------------------------------------------------------------------
# Two-request photo submission (the heart of the task)
# --------------------------------------------------------------------------

@respx.mock
def test_two_request_previews_then_full_sequence():
    _mock_token()
    captured: dict[str, list] = {"instruction": [], "note": []}

    def instr_handler(request: httpx.Request) -> httpx.Response:
        captured["instruction"].append(json.loads(request.content))
        return httpx.Response(200, json=_load("instruction_response.json"))

    def note_handler(request: httpx.Request) -> httpx.Response:
        captured["note"].append(json.loads(request.content))
        return httpx.Response(200, json=_load("note_response.json"))

    respx.post(INSTRUCTION_URL).mock(side_effect=instr_handler)
    respx.post(NOTE_URL).mock(side_effect=note_handler)

    images = [
        {"sequenceIndex": 0, "content": "OVERVIEW", "role": "overview", "registrationVisible": True},
        {"sequenceIndex": 1, "content": "CLOSEUP", "role": "damage_closeup"},
        {"sequenceIndex": 2, "content": "EXTRA1"},
        {"sequenceIndex": 3, "content": "EXTRA2"},
    ]
    result = function_app.submit(
        _valid_core(), images=images, case_po="test26001", vrm="AB12CDE", clm_no="CLM1",
        client=_eva_client(),
    )
    assert result["submitted"] is True
    assert result["evaRef"] == "TEST26001-EVA"

    # Request 1 (Instruction): exactly the 2 preview Files, in order.
    instr_files = captured["instruction"][0]["Files"]
    assert [f["Data"] for f in instr_files] == ["OVERVIEW", "CLOSEUP"]
    # Request 2 (Note): ALL photos in sequence (previews repeated, then extras).
    note_files = captured["note"][0]["Files"]
    assert [f["Data"] for f in note_files] == ["OVERVIEW", "CLOSEUP", "EXTRA1", "EXTRA2"]
    # Note targets the claim by VehReg + ClmNo.
    assert captured["note"][0]["VehReg"] == "AB12CDE"
    assert captured["note"][0]["ClmNo"] == "CLM1"


@respx.mock
def test_only_two_photos_skips_note():
    # With exactly the 2 previews there is nothing extra -> no second request.
    _mock_token()
    instr = _mock_instruction()
    note = _mock_note()
    images = [
        {"sequenceIndex": 0, "content": "OVERVIEW", "role": "overview", "registrationVisible": True},
        {"sequenceIndex": 1, "content": "CLOSEUP", "role": "damage_closeup"},
    ]
    result = function_app.submit(
        _valid_core(), images=images, vrm="AB12CDE", client=_eva_client()
    )
    assert result["submitted"] is True
    assert instr.call_count == 1
    assert note.call_count == 0  # no extra photos -> Note not called


@respx.mock
def test_note_failure_degrades_to_warning_not_failure():
    # Instruction succeeds; the photo-set Note 404s (claim match). submitted stays
    # True (claim exists), with a warning to complete photos manually.
    _mock_token()
    _mock_instruction()
    respx.post(NOTE_URL).mock(return_value=httpx.Response(404))
    images = [
        {"sequenceIndex": 0, "content": "OVERVIEW", "role": "overview", "registrationVisible": True},
        {"sequenceIndex": 1, "content": "CLOSEUP", "role": "damage_closeup"},
        {"sequenceIndex": 2, "content": "EXTRA1"},
    ]
    result = function_app.submit(
        _valid_core(), images=images, vrm="AB12CDE", clm_no="CLM1", client=_eva_client()
    )
    assert result["submitted"] is True
    assert any("remaining photos failed to attach" in w for w in result["warnings"])


@respx.mock
def test_remaining_photos_need_claim_key_warns_when_absent():
    # No VehReg/ClmNo/EvaRef -> cannot target the claim for the Note; we send the
    # 2 previews on the instruction and WARN that the rest were not sent.
    _mock_token()
    respx.post(INSTRUCTION_URL).mock(
        return_value=httpx.Response(200, json={"StatusCode": 200, "Message": "ok"})
    )
    note = _mock_note()
    images = [
        {"sequenceIndex": 0, "content": "OVERVIEW", "role": "overview", "registrationVisible": True},
        {"sequenceIndex": 1, "content": "CLOSEUP", "role": "damage_closeup"},
        {"sequenceIndex": 2, "content": "EXTRA1"},
    ]
    result = function_app.submit(_valid_core(), images=images, client=_eva_client())
    assert result["submitted"] is True
    assert note.call_count == 0
    assert any("NOT sent" in w for w in result["warnings"])


# --------------------------------------------------------------------------
# Overview / registration-visible guard (advisory)
# --------------------------------------------------------------------------

def test_overview_registration_warnings_missing_overview_role():
    images = [
        {"sequenceIndex": 0, "content": "x", "role": "damage_closeup"},
        {"sequenceIndex": 1, "content": "y", "role": "additional"},
    ]
    warns = payload_mod.overview_registration_warnings(images)
    assert any("overview" in w for w in warns)


def test_overview_registration_warnings_flag_not_visible():
    images = [
        {"sequenceIndex": 0, "content": "x", "role": "overview", "registrationVisible": False},
        {"sequenceIndex": 1, "content": "y", "role": "damage_closeup"},
    ]
    warns = payload_mod.overview_registration_warnings(images)
    assert any("registration" in w.lower() for w in warns)


def test_overview_registration_clean_when_visible_overview_present():
    images = [
        {"sequenceIndex": 0, "content": "x", "role": "overview", "registrationVisible": True},
        {"sequenceIndex": 1, "content": "y", "role": "damage_closeup"},
    ]
    assert payload_mod.overview_registration_warnings(images) == []


@respx.mock
def test_submit_surfaces_registration_warning():
    _mock_token()
    _mock_instruction()
    _mock_note()
    images = [
        {"sequenceIndex": 0, "content": "x", "role": "overview", "registrationVisible": False},
        {"sequenceIndex": 1, "content": "y", "role": "damage_closeup"},
        {"sequenceIndex": 2, "content": "z"},
    ]
    result = function_app.submit(
        _valid_core(), images=images, vrm="AB12CDE", client=_eva_client()
    )
    assert result["submitted"] is True  # advisory, not a hard block
    assert any("registration" in w.lower() for w in result["warnings"])


# --------------------------------------------------------------------------
# Idempotency by payload hash
# --------------------------------------------------------------------------

@respx.mock
def test_idempotent_repeat_does_not_resubmit():
    _mock_token()
    instr = _mock_instruction()
    core = _valid_core()
    r1 = function_app.submit(core, payload_hash="hash-XYZ", client=_eva_client())
    r2 = function_app.submit(core, payload_hash="hash-XYZ", client=_eva_client())
    assert r1["submitted"] is True
    assert r2["submitted"] is True
    assert r2.get("idempotent") is True
    assert any("duplicate payload hash" in w for w in r2["warnings"])
    assert instr.call_count == 1  # the second call did NOT hit EVA


@respx.mock
def test_idempotent_repeat_preserves_manual_photo_follow_up_warning():
    _mock_token()
    instr = _mock_instruction()
    respx.post(NOTE_URL).mock(return_value=httpx.Response(404))
    images = [
        {"filename": "overview.jpg", "role": "overview", "registrationVisible": True,
         "sequenceIndex": 0, "content": "YQ=="},
        {"filename": "damage.jpg", "role": "damage_closeup", "sequenceIndex": 1,
         "content": "Yg=="},
        {"filename": "extra.jpg", "role": "additional", "sequenceIndex": 2,
         "content": "Yw=="},
    ]

    first = function_app.submit(
        _valid_core(), images=images, vrm="AB12CDE", clm_no="CLM1",
        payload_hash="warning-replay", client=_eva_client()
    )
    replay = function_app.submit(
        _valid_core(), images=images, vrm="AB12CDE", clm_no="CLM1",
        payload_hash="warning-replay", client=_eva_client()
    )

    warning = "instruction accepted but the remaining photos failed to attach"
    assert any(warning in item for item in first["warnings"])
    assert any(warning in item for item in replay["warnings"])
    assert instr.call_count == 1  # the second call did NOT hit EVA


def test_compute_payload_hash_is_order_independent_and_stable():
    core = _valid_core()
    reordered = {k: core[k] for k in reversed(list(core.keys()))}
    assert function_app.compute_payload_hash(core) == function_app.compute_payload_hash(reordered)
    # different content -> different hash
    other = dict(core)
    other["mileage"] = "99999"
    assert function_app.compute_payload_hash(core) != function_app.compute_payload_hash(other)


# --------------------------------------------------------------------------
# Cross-language contract parity: EVA_PAYLOAD_KEYS == schema propertyNames.enum
# --------------------------------------------------------------------------

def test_payload_keys_match_repo_schema():
    schema = json.loads(
        (REPO_ROOT / "contracts" / "eva-payload.schema.json").read_text(encoding="utf-8")
    )
    schema_keys = tuple(schema["propertyNames"]["enum"])
    assert payload_mod.EVA_PAYLOAD_KEYS == schema_keys
    # required set in the schema is exactly the 12 keys.
    assert set(schema["required"]) == set(payload_mod.EVA_PAYLOAD_KEYS)


# --------------------------------------------------------------------------
# Secret hygiene
# --------------------------------------------------------------------------

def test_secret_never_in_config_repr():
    cfg = EvaConfig(client_id=FAKE_CLIENT_ID, client_secret=FAKE_SECRET, base_url=EVA_BASE)
    r = repr(cfg)
    assert FAKE_SECRET not in r
    assert FAKE_CLIENT_ID not in r
    assert "redacted" in r


@respx.mock
def test_secret_never_in_response_or_logs(caplog):
    _mock_token()
    _mock_instruction()
    _mock_note()
    with caplog.at_level(logging.DEBUG):
        result = function_app.submit(
            _valid_core(),
            images=[
                {"sequenceIndex": 0, "content": "x", "role": "overview", "registrationVisible": True},
                {"sequenceIndex": 1, "content": "y", "role": "damage_closeup"},
                {"sequenceIndex": 2, "content": "z"},
            ],
            vrm="AB12CDE",
            client=_eva_client(),
        )
    serialized = json.dumps(result)
    for secret in (FAKE_SECRET, FAKE_CLIENT_ID, FAKE_TOKEN):
        assert secret not in serialized
        assert secret not in caplog.text


# --------------------------------------------------------------------------
# HTTP handler edges (built without func start)
# --------------------------------------------------------------------------

def _fake_request(body: dict) -> "function_app.func.HttpRequest":
    return function_app.func.HttpRequest(
        method="POST",
        url="/api/eva/instruction-inspection",
        body=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )


def test_handler_gated_off_returns_200(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "false")
    resp = function_app.eva_instruction_inspection(
        _fake_request({"evaPayload12": json.dumps(_valid_core())})
    )
    assert resp.status_code == 200
    p = json.loads(resp.get_body())
    assert p["submitted"] is False
    assert any("EVA_API_ENABLED is false" in w for w in p["warnings"])


def test_handler_invalid_core_returns_400(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "true")
    bad = _valid_core()
    del bad["work_provider"]
    resp = function_app.eva_instruction_inspection(
        _fake_request({"evaPayload12": json.dumps(bad)})
    )
    assert resp.status_code == 400


def test_handler_missing_payload_returns_400(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "true")
    resp = function_app.eva_instruction_inspection(_fake_request({"casePo": "test26001"}))
    assert resp.status_code == 400


@respx.mock
def test_handler_end_to_end_happy_path(monkeypatch):
    monkeypatch.setenv("EVA_API_ENABLED", "true")
    monkeypatch.setenv("EVA_BASE_URL", EVA_BASE)
    monkeypatch.setenv("EVA_CLIENT_ID", FAKE_CLIENT_ID)
    monkeypatch.setenv("EVA_CLIENT_SECRET", FAKE_SECRET)

    _mock_token()
    _mock_instruction()
    _mock_note()

    resp = function_app.eva_instruction_inspection(
        _fake_request(
            {
                "evaPayload12": json.dumps(_valid_core()),
                "payloadHash": "deadbeef",
                "casePo": "test26001",
                "vrm": "AB12CDE",
                "clmNo": "CLM1",
                "images": [
                    {"sequenceIndex": 0, "content": "OV", "role": "overview", "registrationVisible": True},
                    {"sequenceIndex": 1, "content": "CU", "role": "damage_closeup"},
                    {"sequenceIndex": 2, "content": "EX"},
                ],
            }
        )
    )
    assert resp.status_code == 200
    p = json.loads(resp.get_body())
    assert p["submitted"] is True
    assert p["transport"] == "sentry_rest"
    assert p["payloadHash"] == "deadbeef"
    assert p["evaRef"] == "TEST26001-EVA"
    body_text = resp.get_body().decode("utf-8")
    assert FAKE_SECRET not in body_text
    assert FAKE_TOKEN not in body_text


def test_handler_accepts_core_as_object(monkeypatch):
    # evaPayload12 may be passed as an object too; gated off so no EVA contact.
    monkeypatch.setenv("EVA_API_ENABLED", "false")
    resp = function_app.eva_instruction_inspection(
        _fake_request({"evaPayload12": _valid_core()})
    )
    assert resp.status_code == 200
