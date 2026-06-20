"""Offline tests for the Document Intelligence (DI) Read fallback branch.

The OCR host calls DI Read SERVER-SIDE (Function -> DI Read over HTTPS) only when
``OCR_PROVIDER=docintel`` / ``PLATE_PROVIDER=docintel``. DI is an opt-in managed
FALLBACK, never the default (default stays tesseract / fast_alpr). These tests
exercise that branch WITHOUT a live DI resource or any spend: a fake ``requests``
module is injected so we can assert the EXACT verified REST contract
(``prebuilt-read:analyze?_overload=analyzeDocument&api-version=2024-11-30``,
``Ocp-Apim-Subscription-Key`` header, 202 -> Operation-Location -> poll until
``status == "succeeded"`` -> ``analyzeResult.content``) and that ``run_ocr`` /
``read_plate`` with ``provider="docintel"`` actually route through
``docintel_read_bytes``.

Verified against microsoft-docs (DI Read, REST v4.0 / GA 2024-11-30). NO live call.
"""

from __future__ import annotations

import sys
import types

import pytest

import ocr_pdf_adapter
import plate_adapter
from ocr_pdf_adapter import OcrError, docintel_read_bytes


# --------------------------------------------------------------------------- #
# a fake `requests` that records calls and replays a DI 202 -> poll -> succeed  #
# --------------------------------------------------------------------------- #
class _FakeResponse:
    def __init__(self, *, status_code=200, headers=None, json_body=None, text=""):
        self.status_code = status_code
        self.headers = headers or {}
        self._json = json_body if json_body is not None else {}
        self.text = text

    def json(self):
        return self._json


class _FakeRequests:
    """Minimal stand-in for the ``requests`` module the adapter lazy-imports.

    POST -> a 202 with an Operation-Location header (the async analyze ack).
    GET  -> the poll; returns succeeded with a DI ``analyzeResult.content`` body.
    Records every call so the test can assert the URL/headers/body shape.
    """

    def __init__(self, content_text="AB12 CDE READ FROM PHOTO"):
        self.posts: list[dict] = []
        self.gets: list[dict] = []
        self._op_location = "https://di.example/operations/abc-123"
        self._content_text = content_text

    def post(self, url, headers=None, data=None, timeout=None):
        self.posts.append({"url": url, "headers": headers or {}, "data": data, "timeout": timeout})
        return _FakeResponse(status_code=202, headers={"Operation-Location": self._op_location})

    def get(self, url, headers=None, timeout=None):
        self.gets.append({"url": url, "headers": headers or {}, "timeout": timeout})
        return _FakeResponse(
            status_code=200,
            json_body={"status": "succeeded", "analyzeResult": {"content": self._content_text}},
        )


@pytest.fixture
def di_env(monkeypatch):
    """Configure the DI app settings + inject the fake requests module."""
    monkeypatch.setenv("DOCINTEL_ENDPOINT", "https://ce-docintel-dev.cognitiveservices.azure.com/")
    monkeypatch.setenv("DOCINTEL_KEY", "fake-key-not-a-real-secret")
    monkeypatch.setenv("DOCINTEL_API_VERSION", "2024-11-30")
    fake = _FakeRequests()
    monkeypatch.setitem(sys.modules, "requests", fake)
    # ``time`` is imported inside docintel_read_bytes too; the succeeded poll
    # returns on the first GET so no real sleep is hit, but neutralise it anyway.
    monkeypatch.setattr("time.sleep", lambda *_a, **_k: None, raising=False)
    return fake


# --------------------------------------------------------------------------- #
# docintel_read_bytes — the exact REST contract                                #
# --------------------------------------------------------------------------- #
def test_docintel_read_bytes_builds_the_verified_analyze_request(di_env):
    text = docintel_read_bytes(b"\x89PNG\r\n\x1a\n page bytes", content_type="image/png")
    assert text == "AB12 CDE READ FROM PHOTO"

    assert len(di_env.posts) == 1
    post = di_env.posts[0]
    # URL: prebuilt-read async analyze, binary overload, GA api-version. The
    # endpoint trailing slash must be normalised (no '//documentintelligence').
    assert post["url"] == (
        "https://ce-docintel-dev.cognitiveservices.azure.com/documentintelligence/"
        "documentModels/prebuilt-read:analyze?_overload=analyzeDocument&api-version=2024-11-30"
    )
    # Auth + content headers.
    assert post["headers"]["Ocp-Apim-Subscription-Key"] == "fake-key-not-a-real-secret"
    assert post["headers"]["Content-Type"] == "image/png"
    # Raw bytes are POSTed as the body (binary analyzeDocument form).
    assert post["data"] == b"\x89PNG\r\n\x1a\n page bytes"

    # Then exactly one poll GET to the Operation-Location, carrying the key.
    assert len(di_env.gets) == 1
    assert di_env.gets[0]["url"] == "https://di.example/operations/abc-123"
    assert di_env.gets[0]["headers"]["Ocp-Apim-Subscription-Key"] == "fake-key-not-a-real-secret"


def test_docintel_read_bytes_raises_when_not_configured(monkeypatch):
    # Missing endpoint/key -> OcrError (the handler maps this to 502), never a
    # silent empty read.
    monkeypatch.delenv("DOCINTEL_ENDPOINT", raising=False)
    monkeypatch.delenv("DOCINTEL_KEY", raising=False)
    fake = _FakeRequests()
    monkeypatch.setitem(sys.modules, "requests", fake)
    with pytest.raises(OcrError):
        docintel_read_bytes(b"%PDF-1.4", content_type="application/pdf")
    assert fake.posts == []  # never even attempted the call


def test_docintel_failed_status_raises(di_env, monkeypatch):
    # A 'failed' analyze status must surface as OcrError, not be parsed as text.
    def failing_get(url, headers=None, timeout=None):
        return _FakeResponse(status_code=200, json_body={"status": "failed", "error": {"code": "InvalidImage"}})

    monkeypatch.setattr(di_env, "get", failing_get)
    with pytest.raises(OcrError):
        docintel_read_bytes(b"\xff\xd8\xff junk", content_type="image/jpeg")


def test_di_read_text_prefers_top_level_content():
    # The result parser uses analyzeResult.content (full text in reading order).
    out = ocr_pdf_adapter._di_read_text({"analyzeResult": {"content": "hello world"}})
    assert out == "hello world"


def test_di_read_text_falls_back_to_page_lines():
    # When content is absent, stitch per-page line content.
    payload = {
        "analyzeResult": {
            "pages": [
                {"lines": [{"content": "LINE ONE"}, {"content": "LINE TWO"}]},
                {"lines": [{"content": "LINE THREE"}]},
            ]
        }
    }
    assert ocr_pdf_adapter._di_read_text(payload) == "LINE ONE\nLINE TWO\nLINE THREE"


# --------------------------------------------------------------------------- #
# provider routing — docintel actually reaches docintel_read_bytes             #
# --------------------------------------------------------------------------- #
def test_read_plate_docintel_routes_through_docintel_read_bytes(di_env):
    # Engine-absent, provider=docintel: DI Read over the whole photo, then VRM
    # substring match. The fake returns text containing 'AB12 CDE', so a case_vrm
    # of AB12CDE must match.
    out = plate_adapter.read_plate(
        b"\xff\xd8\xff a photo", "overview.jpg", case_vrm="AB12 CDE", provider="docintel"
    )
    assert out["vrm_match"] is True
    assert out["registration_visible"] is True
    # It went through the DI client (one analyze POST happened).
    assert len(di_env.posts) == 1
    assert di_env.posts[0]["headers"]["Content-Type"] == "image/jpeg"


def test_run_ocr_docintel_routes_through_docintel_read_bytes(di_env, monkeypatch):
    # Force the engine-absent raw-text path so run_ocr renders pages and calls DI
    # Read per page. We fake the PyMuPDF (`fitz`) seam so no real PDF/render dep is
    # needed; each rendered page's PNG goes to docintel_read_bytes.
    monkeypatch.setattr(ocr_pdf_adapter, "_engine_available", lambda: False)

    class _FakePixmap:
        def tobytes(self, _fmt):
            return b"\x89PNG\r\n\x1a\n rendered page"

    class _FakePage:
        def get_pixmap(self, matrix=None):
            return _FakePixmap()

    class _FakeDoc:
        page_count = 1

        def __getitem__(self, _i):
            return _FakePage()

        def close(self):
            pass

    fake_fitz = types.SimpleNamespace(
        open=lambda **_k: _FakeDoc(),
        Matrix=lambda a, b: ("matrix", a, b),
    )
    monkeypatch.setitem(sys.modules, "fitz", fake_fitz)

    result = ocr_pdf_adapter.run_ocr(b"%PDF-1.4 image only", "scan.pdf", provider="docintel")
    assert result["extraction"] is None  # engine absent -> raw text only
    assert result["ocr_text"] == "AB12 CDE READ FROM PHOTO"
    assert result["page_count"] == 1
    # DI Read was actually invoked for the rendered page.
    assert len(di_env.posts) == 1
    assert di_env.posts[0]["headers"]["Content-Type"] == "image/png"
