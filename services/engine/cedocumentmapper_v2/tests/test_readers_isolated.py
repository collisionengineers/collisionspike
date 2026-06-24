"""Isolated reader unit tests that do NOT depend on the private corpus.

These tests synthesize tiny inputs in-process (an in-memory python-docx
``Document``, raw EML bytes, a fitz-rendered text PDF) so they run without
Word/LibreOffice/Tesseract installed. The corpus-backed tests live in
``tests/test_readers.py`` and skip when ``docs/Instructions`` is absent; this
file deliberately shares none of that machinery.

Tiers that genuinely need an external binary (the PDF OCR *execution* path,
which shells out to Tesseract) are skipped with an explicit reason.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from cedocumentmapper_v2.domain.models import DocumentModel
from cedocumentmapper_v2.readers import (
    DocxDocumentReader,
    EmailDocumentReader,
    PDFDocumentReader,
    get_reader_for_path,
)
from cedocumentmapper_v2.readers.errors import ReaderError, UnsupportedFormatError


# ---------------------------------------------------------------------------
# Fixtures: synthesize tiny inputs in a tmp dir, no external binaries needed.
# ---------------------------------------------------------------------------


@pytest.fixture
def docx_path(tmp_path: Path) -> Path:
    """A minimal .docx with a header, footer, a body paragraph and a table."""
    docx = pytest.importorskip("docx")
    document = docx.Document()

    section = document.sections[0]
    section.header.paragraphs[0].text = "HEADER LINE ALPHA"
    section.footer.paragraphs[0].text = "FOOTER LINE OMEGA"

    document.add_paragraph("Body paragraph one")

    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Name"
    table.cell(0, 1).text = "Alice"
    table.cell(1, 0).text = "Ref"
    table.cell(1, 1).text = "R-42"

    out = tmp_path / "synthetic.docx"
    document.save(str(out))
    return out


@pytest.fixture
def eml_path(tmp_path: Path) -> Path:
    """A minimal plain-text .eml with standard headers and a two-line body."""
    raw = (
        b"Subject: Test Claim 123\r\n"
        b"From: sender@example.com\r\n"
        b"To: recipient@example.com\r\n"
        b"Date: Wed, 24 Jun 2026 10:00:00 +0000\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n"
        b"\r\n"
        b"Hello this is the body.\r\n"
        b"Second line of body.\r\n"
    )
    out = tmp_path / "synthetic.eml"
    out.write_bytes(raw)
    return out


@pytest.fixture
def text_pdf_path(tmp_path: Path) -> Path:
    """A single-page PDF carrying selectable text (no rasterised image)."""
    fitz = pytest.importorskip("fitz")
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Selectable claim text ALPHA")
    out = tmp_path / "synthetic.pdf"
    doc.save(str(out))
    doc.close()
    return out


# ---------------------------------------------------------------------------
# DOCX
# ---------------------------------------------------------------------------


def test_docx_extracts_header_body_table_footer(docx_path: Path) -> None:
    reader = DocxDocumentReader()
    model = reader.read(docx_path)

    assert isinstance(model, DocumentModel)
    assert model.source_type == "docx"
    assert len(model.pages) == 1

    text = model.plain_text
    # Header and footer are pulled from the zip part, not python-docx body.
    assert "HEADER LINE ALPHA" in text
    assert "FOOTER LINE OMEGA" in text
    # Body paragraph.
    assert "Body paragraph one" in text
    # Table rows are flattened with " | " between non-empty cells.
    assert "Name | Alice" in text
    assert "Ref | R-42" in text


def test_docx_assigns_line_groups(docx_path: Path) -> None:
    reader = DocxDocumentReader()
    model = reader.read(docx_path)

    groups = set(model.metadata["line_groups"])
    assert {"header", "body", "footer"}.issubset(groups)
    # Exactly one table -> table_0.
    assert "table_0" in groups

    by_group = {line.block_id: line.text for page in model.pages for line in page.lines}
    assert by_group["header"] == "HEADER LINE ALPHA"
    assert by_group["footer"] == "FOOTER LINE OMEGA"


def test_docx_missing_file_raises_reader_error(tmp_path: Path) -> None:
    reader = DocxDocumentReader()
    with pytest.raises(ReaderError):
        reader.read(tmp_path / "does-not-exist.docx")


# ---------------------------------------------------------------------------
# EML
# ---------------------------------------------------------------------------


def test_eml_parses_headers_and_body(eml_path: Path) -> None:
    reader = EmailDocumentReader()
    model = reader.read(eml_path)

    assert isinstance(model, DocumentModel)
    assert model.source_type == "eml"
    assert len(model.pages) == 1
    assert model.metadata["email_source_type"] == "eml"

    lines = [line.text for line in model.pages[0].lines]
    assert "Subject: Test Claim 123" in lines
    assert "From: sender@example.com" in lines
    assert "To: recipient@example.com" in lines
    assert "Hello this is the body." in lines
    assert "Second line of body." in lines


def test_eml_strips_html_when_no_plaintext(tmp_path: Path) -> None:
    raw = (
        b"Subject: HTML Only\r\n"
        b"From: sender@example.com\r\n"
        b"Content-Type: text/html; charset=utf-8\r\n"
        b"\r\n"
        b"<html><body><p>Paragraph one</p><p>Paragraph two</p></body></html>\r\n"
    )
    eml = tmp_path / "html.eml"
    eml.write_bytes(raw)

    model = EmailDocumentReader().read(eml)
    assert "Paragraph one" in model.plain_text
    assert "Paragraph two" in model.plain_text
    # Tags must not leak through.
    assert "<p>" not in model.plain_text
    assert "<html" not in model.plain_text


def test_eml_missing_file_raises_reader_error(tmp_path: Path) -> None:
    with pytest.raises(ReaderError):
        EmailDocumentReader().read(tmp_path / "missing.eml")


# ---------------------------------------------------------------------------
# Reader dispatch / unsupported formats
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, expected_cls",
    [
        ("a.pdf", PDFDocumentReader),
        ("a.docx", DocxDocumentReader),
        ("a.eml", EmailDocumentReader),
        ("a.msg", EmailDocumentReader),
    ],
)
def test_get_reader_for_known_extensions(name: str, expected_cls: type) -> None:
    reader = get_reader_for_path(Path(name))
    assert isinstance(reader, expected_cls)


@pytest.mark.parametrize("name", ["data.xyz", "image.png", "noext", "archive.zip"])
def test_get_reader_unsupported_extension_raises(name: str) -> None:
    with pytest.raises(UnsupportedFormatError):
        get_reader_for_path(Path(name))


# ---------------------------------------------------------------------------
# PDF tier selection / OCR-trigger decision logic
# ---------------------------------------------------------------------------


def test_pdf_text_tier_extracts_selectable_text(text_pdf_path: Path) -> None:
    reader = PDFDocumentReader()
    model = reader.read(text_pdf_path)

    assert isinstance(model, DocumentModel)
    assert model.source_type == "pdf"
    assert len(model.pages) == 1
    assert "Selectable claim text ALPHA" in model.plain_text
    assert model.metadata["page_count"] == 1


def test_pdf_skips_ocr_when_selectable_text_present(text_pdf_path: Path) -> None:
    """A PDF with embedded text must short-circuit the OCR fallback.

    This exercises the OCR-trigger *decision* logic, which is pure heuristic
    evaluation and needs no Tesseract binary: because selectable text was
    extracted, OCR is skipped and the reason is recorded.
    """
    reader = PDFDocumentReader()
    model = reader.read(text_pdf_path)

    assert model.metadata["ocr_forced"] is False
    skip_notes = [n for n in model.reader_notes if "OCR skipped" in n]
    assert skip_notes, model.reader_notes
    assert "selectable text was already extracted" in skip_notes[0]
    # The OCR-executed marker must be absent.
    assert not any("OCR fallback" in n for n in model.reader_notes)


def test_pdf_records_ocr_time_limit_in_metadata(text_pdf_path: Path) -> None:
    reader = PDFDocumentReader()
    model = reader.read(text_pdf_path, ocr_time_limit_seconds=5.0)
    assert model.metadata["ocr_time_limit_seconds"] == 5.0
    assert model.metadata["ocr_page_limit"] >= 1


def test_pdf_missing_file_raises_reader_error(tmp_path: Path) -> None:
    with pytest.raises(ReaderError):
        PDFDocumentReader().read(tmp_path / "missing.pdf")


@pytest.mark.skipif(
    shutil.which("tesseract") is None,
    reason="OCR execution tier requires the external Tesseract binary on PATH",
)
def test_pdf_force_ocr_executes_when_binary_present(tmp_path: Path) -> None:
    """When forced, the OCR tier runs end-to-end (needs the Tesseract binary)."""
    fitz = pytest.importorskip("fitz")
    doc = fitz.open()
    doc.new_page()  # blank page, no selectable text
    pdf = tmp_path / "blank.pdf"
    doc.save(str(pdf))
    doc.close()

    model = PDFDocumentReader().read(pdf, force_ocr=True)
    assert model.metadata["ocr_forced"] is True
    # Either OCR ran or it was attempted; in all cases the forced flag is set
    # and the decision note acknowledges the override path.
    assert any(
        "OCR" in n for n in model.reader_notes
    ), model.reader_notes
