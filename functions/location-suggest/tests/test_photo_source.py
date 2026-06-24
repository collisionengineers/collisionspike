"""Unit tests for the Box photo seam (stub default; activation marker)."""

from __future__ import annotations

import pytest

import photo_source as ps
from photo_source import (
    BoxPhotoSource,
    PhotoRef,
    PhotoUnavailableError,
    StubPhotoSource,
    get_photo_source,
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
