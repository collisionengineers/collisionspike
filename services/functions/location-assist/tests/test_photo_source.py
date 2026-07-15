"""Unit tests for the Box photo seam (stub default; activation marker)."""

from __future__ import annotations

import base64

import pytest

import photo_source as ps
from photo_source import (
    BoxPhotoSource,
    InlinePhotoSource,
    PhotoRef,
    PhotoUnavailableError,
    StubPhotoSource,
    get_photo_source,
    select_photo_source,
)


def test_stub_returns_fixture_bytes():
    src = StubPhotoSource({"ev1": b"hello"})
    assert src.fetch_bytes(PhotoRef(evidence_id="ev1")) == b"hello"


def test_stub_unknown_ref_raises():
    src = StubPhotoSource({})
    with pytest.raises(PhotoUnavailableError):
        src.fetch_bytes(PhotoRef(evidence_id="nope"))


def test_factory_defaults_to_stub_when_box_dormant(monkeypatch):
    monkeypatch.delenv("BOX_API_ENABLED", raising=False)
    src = get_photo_source({"ev1": b"x"})
    assert isinstance(src, StubPhotoSource)
    assert src.fetch_bytes(PhotoRef(evidence_id="ev1")) == b"x"


def test_factory_false_value_is_stub(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "false")
    assert isinstance(get_photo_source({}), StubPhotoSource)


def test_factory_selects_box_when_enabled(monkeypatch):
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    src = get_photo_source({})
    assert isinstance(src, BoxPhotoSource)


def test_box_source_is_unwired_activation_step():
    """BoxPhotoSource is present but NOT wired in v1: it must raise rather than
    silently no-op, so a premature flip of BOX_API_ENABLED is loud."""
    with pytest.raises(PhotoUnavailableError):
        BoxPhotoSource().fetch_bytes(PhotoRef(evidence_id="ev1", box_file_id="123"))


def test_truthy_helper():
    assert ps._truthy("true")
    assert ps._truthy("1")
    assert ps._truthy("YES")
    assert not ps._truthy("false")
    assert not ps._truthy("")
    assert not ps._truthy(None)


# --- InlinePhotoSource (TKT-077) --------------------------------------------------------------

def test_inline_source_decodes_base64_bytes():
    b64 = base64.b64encode(b"\xff\xd8jpegbytes").decode("ascii")
    src = InlinePhotoSource()
    assert src.fetch_bytes(PhotoRef(evidence_id="ev1", inline_b64=b64)) == b"\xff\xd8jpegbytes"


def test_inline_source_missing_bytes_raises():
    with pytest.raises(PhotoUnavailableError):
        InlinePhotoSource().fetch_bytes(PhotoRef(evidence_id="ev1"))


def test_inline_source_bad_base64_raises():
    with pytest.raises(PhotoUnavailableError):
        InlinePhotoSource().fetch_bytes(PhotoRef(evidence_id="ev1", inline_b64="!!!not base64!!!==="))


def test_select_prefers_inline_when_any_ref_has_bytes(monkeypatch):
    # Box "enabled" would normally pick the raising BoxPhotoSource — inline must win.
    monkeypatch.setenv("BOX_API_ENABLED", "true")
    refs = [PhotoRef(evidence_id="a"), PhotoRef(evidence_id="b", inline_b64=base64.b64encode(b"x").decode())]
    assert isinstance(select_photo_source(refs), InlinePhotoSource)


def test_select_falls_back_to_factory_without_inline(monkeypatch):
    monkeypatch.delenv("BOX_API_ENABLED", raising=False)
    refs = [PhotoRef(evidence_id="a"), PhotoRef(evidence_id="b")]
    assert isinstance(select_photo_source(refs, {"a": b"x"}), StubPhotoSource)
