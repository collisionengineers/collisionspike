"""Offline test for the DI-Read OCR hook the engine path installs.

When ``provider="docintel"`` AND the vendored engine is present, ``_run_engine``
does NOT touch the vendored source: it RUNTIME-monkeypatches the engine PDF
reader's ``pytesseract.image_to_string`` so each page the engine renders to a PIL
image is routed through Document Intelligence Read instead of Tesseract
(``_install_docintel_ocr_hook``). It returns a zero-arg restore callable that puts
the original ``image_to_string`` back in ``finally``.

This test exercises that seam WITHOUT any DI resource or spend: a fake
``pytesseract`` module is injected (so we own the ``original`` the hook must
restore) and the DI call is faked the same way ``test_docintel_branch.py`` does.
We assert (a) the installed hook saves the PIL image to PNG and routes the bytes
through ``docintel_read_bytes``, and (b) ``restore()`` puts the original callable
back. If PIL is genuinely unavailable we skip rather than fail.

NO live call. Verified-contract DI fake reused from the docintel-branch tests.
"""

from __future__ import annotations

import sys
import types

import pytest

import ocr_pdf_adapter


# --------------------------------------------------------------------------- #
# a fake `requests` replaying a DI 202 -> poll -> succeed (mirrors            #
# test_docintel_branch.py so the hook's docintel_read_bytes call has a backend) #
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
    def __init__(self, content_text="TEXT FROM DI READ"):
        self.posts: list[dict] = []
        self.gets: list[dict] = []
        self._op_location = "https://di.example/operations/hook-1"
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
    """Configure DI app settings + inject the fake requests module (no spend)."""
    monkeypatch.setenv("DOCINTEL_ENDPOINT", "https://ce-docintel-dev.cognitiveservices.azure.com/")
    monkeypatch.setenv("DOCINTEL_KEY", "fake-key-not-a-real-secret")
    monkeypatch.setenv("DOCINTEL_API_VERSION", "2024-11-30")
    fake = _FakeRequests()
    monkeypatch.setitem(sys.modules, "requests", fake)
    monkeypatch.setattr("time.sleep", lambda *_a, **_k: None, raising=False)
    return fake


@pytest.fixture
def fake_pytesseract(monkeypatch):
    """Inject a fake ``pytesseract`` so we own the ``original`` the hook restores.

    The real engine reader does ``import pytesseract`` and calls
    ``pytesseract.image_to_string(img, lang=...)``; the hook swaps that attribute
    at runtime. A sentinel original lets us prove restore() truly puts it back.
    """
    def _sentinel_image_to_string(img, *args, **kwargs):  # the "Tesseract" path
        return "TESSERACT WOULD HAVE RUN"

    fake = types.ModuleType("pytesseract")
    fake.image_to_string = _sentinel_image_to_string
    monkeypatch.setitem(sys.modules, "pytesseract", fake)
    return fake


# --------------------------------------------------------------------------- #
# _install_docintel_ocr_hook — installs the DI route + restores the original   #
# --------------------------------------------------------------------------- #
def test_hook_routes_pil_image_through_docintel_then_restores(di_env, fake_pytesseract):
    Image = pytest.importorskip("PIL.Image")  # skip cleanly if Pillow truly absent

    original = fake_pytesseract.image_to_string

    restore = ocr_pdf_adapter._install_docintel_ocr_hook()

    # The hook replaced image_to_string with the DI-Read shim (not the original).
    assert fake_pytesseract.image_to_string is not original

    # A real PIL image fed through the installed shim is saved to PNG and routed
    # through docintel_read_bytes (which the fake DI backend answers).
    img = Image.new("RGB", (4, 4), color="white")
    out = fake_pytesseract.image_to_string(img, lang="eng")
    assert out == "TEXT FROM DI READ"

    # The page reached DI Read as a PNG via the verified analyze contract.
    assert len(di_env.posts) == 1
    assert di_env.posts[0]["headers"]["Content-Type"] == "image/png"
    assert di_env.posts[0]["data"][:8] == b"\x89PNG\r\n\x1a\n"  # the shim re-encoded to PNG
    assert len(di_env.gets) == 1  # one poll to Operation-Location

    # restore() puts the original Tesseract callable back.
    restore()
    assert fake_pytesseract.image_to_string is original
    assert fake_pytesseract.image_to_string(img, lang="eng") == "TESSERACT WOULD HAVE RUN"


def test_hook_no_ops_when_pytesseract_absent(monkeypatch):
    # If pytesseract is not importable, the hook returns a harmless zero-arg
    # restore and changes nothing (the engine then uses whatever OCR it has).
    monkeypatch.setitem(sys.modules, "pytesseract", None)  # forces ImportError on import
    restore = ocr_pdf_adapter._install_docintel_ocr_hook()
    assert callable(restore)
    restore()  # must not raise
