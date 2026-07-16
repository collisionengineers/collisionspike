"""TKT-142 — BoxClient streamed upload lanes (direct multipart vs chunked session).

[BUILD] — ZERO network, NO real secrets; respx mocks the token mint, the upload
host, the upload-session endpoints. Pins:

* the 20 MiB size branch (direct below, chunked-session at/above);
* the direct lane STREAMS the file object (multipart) and shares the TKT-087
  409 policy (reuse on same sha1, one content-disambiguated retry on mismatch);
* the chunked lane uses EXACTLY session.part_size chunks (last part smaller),
  per-part ``digest: sha=<b64 sha1>`` + ``content-range`` headers, the commit
  payload (parts + attributes + whole-file digest), parts retried once on 5xx,
  and the shared 409 policy on session-create and commit.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import sys
from pathlib import Path

import httpx
import pytest
import respx

FN_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(FN_DIR))

import box_client as box_client_module  # noqa: E402
from box_client import CHUNKED_UPLOAD_MIN_BYTES, BoxClient, BoxError  # noqa: E402
from jwt_testkit import jwt_box_config  # noqa: E402

API_BASE = "https://api.box.com"
TOKEN_URL = f"{API_BASE}/oauth2/token"
UPLOAD_URL = "https://upload.box.com/api/2.0/files/content"
SESSION_URL = "https://upload.box.com/api/2.0/files/upload_sessions"
PART_URL = "https://upload.box.com/api/2.0/files/upload_sessions/S1"
COMMIT_URL = "https://upload.box.com/api/2.0/files/upload_sessions/S1/commit"


def _client() -> BoxClient:
    return BoxClient(config=jwt_box_config())


def _mock_token() -> None:
    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": "T", "expires_in": 3599})
    )


def _sha1_hex(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _sha1_b64(data: bytes) -> str:
    return base64.b64encode(hashlib.sha1(data).digest()).decode("ascii")


def _session_json(part_size: int) -> dict:
    return {
        "id": "S1",
        "part_size": part_size,
        "total_parts": 0,
        "session_endpoints": {
            "upload_part": PART_URL,
            "commit": COMMIT_URL,
            "abort": PART_URL,
        },
    }


def test_chunked_min_constant_is_20_mib():
    # The branch point the orchestration/docs reason about — pin it.
    assert CHUNKED_UPLOAD_MIN_BYTES == 20 * 1024 * 1024


# ==========================================================================
# Direct lane (< 20 MiB): streamed multipart + shared 409 policy
# ==========================================================================

@respx.mock
def test_stream_small_file_goes_direct_multipart():
    _mock_token()
    data = b"raw-eml-bytes" * 100
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read()
        return httpx.Response(
            201, json={"entries": [{"id": "f1", "type": "file", "name": "big.eml"}]}
        )

    session_route = respx.post(SESSION_URL).mock(return_value=httpx.Response(500))
    respx.post(UPLOAD_URL).mock(side_effect=handler)

    c = _client()
    out = c.upload_file_stream(
        "0", "big.eml", io.BytesIO(data),
        size=len(data), sha1_hex=_sha1_hex(data), content_type="message/rfc822",
    )
    assert out["id"] == "f1"
    assert out["outcome"] == "created"
    assert out["lane"] == "direct"
    # The multipart body carried the STREAMED bytes + the attributes JSON.
    assert data in captured["body"]
    assert b'"parent"' in captured["body"]
    assert not session_route.called  # below the boundary -> never a session
    c.close()


@respx.mock
def test_stream_409_same_sha1_is_idempotent_reuse():
    _mock_token()
    data = b"x"
    conflict = {
        "type": "error", "code": "item_name_in_use",
        "context_info": {"conflicts": {"type": "file", "id": "999", "name": "message.eml",
                                       "sha1": _sha1_hex(data)}},
    }
    respx.post(UPLOAD_URL).mock(return_value=httpx.Response(409, json=conflict))
    c = _client()
    out = c.upload_file_stream(
        "0", "message.eml", io.BytesIO(data), size=1, sha1_hex=_sha1_hex(data)
    )
    assert out["id"] == "999"
    assert out["outcome"] == "reused"
    assert out["lane"] == "direct"
    c.close()


@respx.mock
def test_stream_409_different_sha1_retries_disambiguated_name():
    _mock_token()
    data = b"x"
    local_sha1 = _sha1_hex(data)
    conflict = {
        "type": "error", "code": "item_name_in_use",
        "context_info": {"conflicts": {"type": "file", "id": "999", "name": "message.eml",
                                       "sha1": "d" * 40}},
    }
    bodies: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(request.read())
        if len(bodies) == 1:
            return httpx.Response(409, json=conflict)
        return httpx.Response(
            201,
            json={"entries": [{"id": "f2", "type": "file",
                               "name": f"message-{local_sha1[:8]}.eml"}]},
        )

    respx.post(UPLOAD_URL).mock(side_effect=handler)
    c = _client()
    out = c.upload_file_stream(
        "0", "message.eml", io.BytesIO(data), size=1, sha1_hex=local_sha1
    )
    assert out["id"] == "f2"
    assert out["outcome"] == "created"
    assert len(bodies) == 2
    # The retry re-seeked the stream (bytes present again) under the alt name.
    assert f"message-{local_sha1[:8]}.eml".encode() in bodies[1]
    assert data in bodies[1]
    c.close()


# ==========================================================================
# Size branch: chunked session at/above the boundary
# ==========================================================================

@respx.mock
def test_stream_at_boundary_uses_chunked_session(monkeypatch):
    # The real boundary is 20 MiB; shrink it so the test moves 10 bytes, and pin
    # the >=/< branch semantics exactly AT the boundary.
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefgh"  # exactly the boundary -> chunked
    respx.post(SESSION_URL).mock(return_value=httpx.Response(201, json=_session_json(4)))
    respx.put(PART_URL).mock(
        side_effect=lambda request: httpx.Response(
            200,
            json={"part": {"part_id": "P", "offset": 0, "size": len(request.read()),
                           "sha1": "s"}},
        )
    )
    respx.post(COMMIT_URL).mock(
        return_value=httpx.Response(
            201, json={"entries": [{"id": "f9", "type": "file", "name": "big.bin"}]}
        )
    )
    direct = respx.post(UPLOAD_URL).mock(return_value=httpx.Response(500))
    c = _client()
    out = c.upload_file_stream(
        "0", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
    )
    assert out["outcome"] == "created"
    assert out["lane"] == "chunked"
    assert not direct.called  # at the boundary -> session, never direct
    c.close()


@respx.mock
def test_stream_below_boundary_stays_direct(monkeypatch):
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefg"  # one byte below -> direct
    session = respx.post(SESSION_URL).mock(return_value=httpx.Response(500))
    respx.post(UPLOAD_URL).mock(
        return_value=httpx.Response(
            201, json={"entries": [{"id": "f1", "type": "file", "name": "small.bin"}]}
        )
    )
    c = _client()
    out = c.upload_file_stream(
        "0", "small.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
    )
    assert out["lane"] == "direct"
    assert not session.called
    c.close()


# ==========================================================================
# Chunked mechanics: exact part_size chunks, digests, content-range, commit
# ==========================================================================

@respx.mock
def test_chunked_parts_carry_exact_ranges_and_digests(monkeypatch):
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefghij"  # 10 bytes, part_size 4 -> abcd / efgh / ij
    respx.post(SESSION_URL).mock(return_value=httpx.Response(201, json=_session_json(4)))

    part_calls: list[dict] = []

    def part_handler(request: httpx.Request) -> httpx.Response:
        chunk = request.read()
        part_calls.append(
            {
                "content": chunk,
                "range": request.headers["content-range"],
                "digest": request.headers["digest"],
            }
        )
        return httpx.Response(
            200,
            json={"part": {"part_id": f"P{len(part_calls)}", "offset": 0,
                           "size": len(chunk), "sha1": "s"}},
        )

    respx.put(PART_URL).mock(side_effect=part_handler)

    commit_captured: dict = {}

    def commit_handler(request: httpx.Request) -> httpx.Response:
        commit_captured["body"] = json.loads(request.read())
        commit_captured["digest"] = request.headers["digest"]
        return httpx.Response(
            201, json={"entries": [{"id": "f9", "type": "file", "name": "big.bin"}]}
        )

    respx.post(COMMIT_URL).mock(side_effect=commit_handler)

    c = _client()
    out = c.upload_file_stream(
        "777", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
    )
    assert out["id"] == "f9"
    assert out["lane"] == "chunked"

    # EXACTLY part_size chunks; the last part smaller.
    assert [p["content"] for p in part_calls] == [b"abcd", b"efgh", b"ij"]
    assert [p["range"] for p in part_calls] == [
        "bytes 0-3/10", "bytes 4-7/10", "bytes 8-9/10",
    ]
    # Per-part digest: sha=<base64 sha1 of the PART>.
    assert [p["digest"] for p in part_calls] == [
        f"sha={_sha1_b64(b'abcd')}", f"sha={_sha1_b64(b'efgh')}", f"sha={_sha1_b64(b'ij')}",
    ]
    # Commit: the parts list (as returned by Box), the attributes, the WHOLE-file digest.
    assert commit_captured["digest"] == f"sha={_sha1_b64(data)}"
    body = commit_captured["body"]
    assert body["attributes"] == {"name": "big.bin", "parent": {"id": "777"}}
    assert [p["part_id"] for p in body["parts"]] == ["P1", "P2", "P3"]
    c.close()


@respx.mock
def test_chunked_part_5xx_retries_once_then_succeeds(monkeypatch):
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefgh"  # 8 bytes, part_size 4 -> 2 parts
    respx.post(SESSION_URL).mock(return_value=httpx.Response(201, json=_session_json(4)))

    calls = {"n": 0}

    def flaky_part(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        request.read()
        if calls["n"] == 1:
            return httpx.Response(502)  # first attempt of part 1 -> retried ONCE
        return httpx.Response(
            200, json={"part": {"part_id": f"P{calls['n']}", "offset": 0, "size": 4, "sha1": "s"}}
        )

    part_route = respx.put(PART_URL).mock(side_effect=flaky_part)
    respx.post(COMMIT_URL).mock(
        return_value=httpx.Response(
            201, json={"entries": [{"id": "f9", "type": "file", "name": "big.bin"}]}
        )
    )
    c = _client()
    out = c.upload_file_stream(
        "0", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
    )
    assert out["outcome"] == "created"
    assert part_route.call_count == 3  # part1 (5xx) + part1 retry + part2
    c.close()


@respx.mock
def test_chunked_part_persistent_5xx_raises(monkeypatch):
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefgh"
    respx.post(SESSION_URL).mock(return_value=httpx.Response(201, json=_session_json(4)))
    part_route = respx.put(PART_URL).mock(return_value=httpx.Response(503))
    c = _client()
    with pytest.raises(BoxError) as ei:
        c.upload_file_stream(
            "0", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
        )
    assert ei.value.status == 503
    assert part_route.call_count == 2  # ONE retry, no storm
    c.close()


@respx.mock
def test_chunked_session_create_409_same_sha1_reuses(monkeypatch):
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefgh"
    conflict = {
        "type": "error", "code": "item_name_in_use",
        "context_info": {"conflicts": {"type": "file", "id": "888", "name": "big.bin",
                                       "sha1": _sha1_hex(data)}},
    }
    respx.post(SESSION_URL).mock(return_value=httpx.Response(409, json=conflict))
    part_route = respx.put(PART_URL).mock(return_value=httpx.Response(500))
    c = _client()
    out = c.upload_file_stream(
        "0", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
    )
    assert out["id"] == "888"
    assert out["outcome"] == "reused"
    assert out["lane"] == "chunked"
    assert not part_route.called  # resolved BEFORE any byte moved
    c.close()


@respx.mock
def test_chunked_commit_409_same_sha1_reuses(monkeypatch):
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefgh"
    respx.post(SESSION_URL).mock(return_value=httpx.Response(201, json=_session_json(4)))
    respx.put(PART_URL).mock(
        return_value=httpx.Response(
            200, json={"part": {"part_id": "P", "offset": 0, "size": 4, "sha1": "s"}}
        )
    )
    conflict = {
        "type": "error", "code": "item_name_in_use",
        "context_info": {"conflicts": {"type": "file", "id": "888", "name": "big.bin",
                                       "sha1": _sha1_hex(data)}},
    }
    respx.post(COMMIT_URL).mock(return_value=httpx.Response(409, json=conflict))
    c = _client()
    out = c.upload_file_stream(
        "0", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
    )
    assert out["id"] == "888"
    assert out["outcome"] == "reused"
    assert out["lane"] == "chunked"
    c.close()


@respx.mock
def test_chunked_refuses_non_box_session_endpoints(monkeypatch):
    # Session endpoints come from the response body — a non-Box host must be
    # refused BEFORE any bearer/byte goes to it.
    monkeypatch.setattr(box_client_module, "CHUNKED_UPLOAD_MIN_BYTES", 8)
    _mock_token()
    data = b"abcdefgh"
    evil = respx.put("https://evil.example.com/part").mock(
        return_value=httpx.Response(200)
    )
    session = _session_json(4)
    session["session_endpoints"]["upload_part"] = "https://evil.example.com/part"
    respx.post(SESSION_URL).mock(return_value=httpx.Response(201, json=session))
    c = _client()
    with pytest.raises(box_client_module.BoxConfigError):
        c.upload_file_stream(
            "0", "big.bin", io.BytesIO(data), size=len(data), sha1_hex=_sha1_hex(data)
        )
    assert not evil.called
    c.close()
