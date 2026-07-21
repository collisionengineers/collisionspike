"""Tests for the canonical Table model and PDF table population."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from cedocumentmapper_v2.domain.models import DocumentPage, Table
from cedocumentmapper_v2.readers import pdf as pdf_reader
from cedocumentmapper_v2.readers.pdf import PDFDocumentReader, _extract_page_tables

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PDF = REPO_ROOT / "tests" / "fixtures" / "instructions" / "SBL 01.pdf"


# --- Table dataclass -------------------------------------------------------


def test_table_defaults_are_empty():
    table = Table()
    assert table.rows == ()
    assert table.bbox is None
    assert table.page_index is None


def test_table_holds_rows_and_metadata():
    rows = (("a", "b"), ("c", "d"))
    table = Table(rows=rows, bbox=(0.0, 1.0, 2.0, 3.0), page_index=2)
    assert table.rows == rows
    assert table.bbox == (0.0, 1.0, 2.0, 3.0)
    assert table.page_index == 2


def test_table_is_frozen():
    table = Table(rows=(("x",),))
    with pytest.raises(dataclasses.FrozenInstanceError):
        table.page_index = 5  # type: ignore[misc]


def test_page_defaults_to_no_tables():
    page = DocumentPage(page_index=0)
    assert page.tables == ()


def test_page_carries_tables():
    table = Table(rows=(("h1", "h2"),))
    page = DocumentPage(page_index=0, tables=(table,))
    assert page.tables == (table,)


# --- _extract_page_tables helper (monkeypatched fitz page) -----------------


class _FakeFoundTable:
    def __init__(self, data, bbox=None):
        self._data = data
        self.bbox = bbox

    def extract(self):
        return self._data


class _FakeFinder:
    def __init__(self, tables):
        self.tables = tables


class _FakePageWithTables:
    def __init__(self, finder):
        self._finder = finder

    def find_tables(self):
        return self._finder


class _FakePageNoFindTables:
    """A page object lacking find_tables (simulates older PyMuPDF)."""


def test_extract_page_tables_builds_table_model():
    found = _FakeFoundTable([["A", "B"], ["1", None]], bbox=(0, 0, 10, 10))
    page = _FakePageWithTables(_FakeFinder([found]))

    tables, note = _extract_page_tables(page, page_idx=3)

    assert note is None
    assert len(tables) == 1
    table = tables[0]
    # None cells become empty strings; rows are tuples of strings.
    assert table.rows == (("A", "B"), ("1", ""))
    assert table.bbox == (0.0, 0.0, 10.0, 10.0)
    assert table.page_index == 3


def test_extract_page_tables_no_find_tables_returns_note():
    tables, note = _extract_page_tables(_FakePageNoFindTables(), page_idx=0)
    assert tables == ()
    assert note is not None
    assert "find_tables" in note


def test_extract_page_tables_handles_empty_extract():
    found = _FakeFoundTable([])
    page = _FakePageWithTables(_FakeFinder([found]))
    tables, note = _extract_page_tables(page, page_idx=0)
    assert tables == ()
    assert note is None


def test_extract_page_tables_swallows_find_tables_failure():
    class _Boom:
        def find_tables(self):
            raise RuntimeError("boom")

    tables, note = _extract_page_tables(_Boom(), page_idx=1)
    assert tables == ()
    assert note is not None
    assert "failed" in note.lower()


# --- Reader integration ----------------------------------------------------


def test_reader_records_note_when_find_tables_unavailable(monkeypatch):
    """If find_tables is absent the reader must degrade gracefully and note it."""

    def fake_extract(page, page_idx):
        return (), "Table extraction unavailable (PyMuPDF lacks find_tables)."

    monkeypatch.setattr(pdf_reader, "_extract_page_tables", fake_extract)

    if not FIXTURE_PDF.exists():
        pytest.skip("SBL 01.pdf fixture not available")

    model = PDFDocumentReader().read(FIXTURE_PDF)
    assert any("Table extraction unavailable" in n for n in model.reader_notes)
    # Note recorded only once even across multiple pages.
    assert sum("Table extraction unavailable" in n for n in model.reader_notes) == 1
    for page in model.pages:
        assert page.tables == ()


def test_reader_populates_tables_from_monkeypatched_find_tables(monkeypatch):
    """Tables surfaced by find_tables should land on the matching page."""

    sentinel = Table(rows=(("col1", "col2"), ("v1", "v2")), page_index=0)

    def fake_extract(page, page_idx):
        if page_idx == 0:
            return (dataclasses.replace(sentinel, page_index=page_idx),), None
        return (), None

    monkeypatch.setattr(pdf_reader, "_extract_page_tables", fake_extract)

    if not FIXTURE_PDF.exists():
        pytest.skip("SBL 01.pdf fixture not available")

    model = PDFDocumentReader().read(FIXTURE_PDF)
    assert model.pages, "expected at least one page"
    first = model.pages[0]
    assert len(first.tables) == 1
    assert first.tables[0].rows == (("col1", "col2"), ("v1", "v2"))
    assert first.tables[0].page_index == 0


@pytest.mark.skipif(not FIXTURE_PDF.exists(), reason="SBL 01.pdf fixture not available")
def test_reader_real_pdf_tables_do_not_raise():
    """Real-PDF path: table extraction must never raise and tables are well-formed."""
    model = PDFDocumentReader().read(FIXTURE_PDF)
    for page in model.pages:
        assert isinstance(page.tables, tuple)
        for table in page.tables:
            assert isinstance(table, Table)
            assert isinstance(table.rows, tuple)
            for row in table.rows:
                assert all(isinstance(cell, str) for cell in row)
            assert table.page_index == page.page_index
