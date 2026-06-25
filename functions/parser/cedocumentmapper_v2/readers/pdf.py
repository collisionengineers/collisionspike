from __future__ import annotations

import contextlib
import io
import os
import re
import shutil
import sys
import time
from pathlib import Path
import fitz
from pypdf import PdfReader
from PIL import Image as PILImage
import pytesseract

from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    DocumentPage,
    DocumentLine,
    Table,
)
from cedocumentmapper_v2.readers.base import DocumentReader
from cedocumentmapper_v2.readers.errors import ReaderError, DependencyMissingError

OCR_PAGE_LIMIT = 2
# Wall-clock ceiling (seconds) for the whole OCR pass. The page-count cap alone
# does not bound runtime on slow/large rasters, so we also stop once this budget
# is exceeded and surface it in the reader notes.
OCR_TIME_LIMIT_SECONDS = 120.0


def resource_path(relative_path: str) -> Path:
    """Get absolute path to resource, works for dev and for PyInstaller."""
    if hasattr(sys, "_MEIPASS"):
        return Path(getattr(sys, "_MEIPASS")) / relative_path
    # Look next to the executing script/module
    curr = Path(__file__).resolve()
    # Travel up to find root of the repo (cedocumentmapper_v2.0)
    for parent in curr.parents:
        if (parent / "requirements.txt").exists():
            return parent / relative_path
    return curr.parent / relative_path


def configure_tesseract() -> bool:
    """Configure pytesseract using bundled binary if available."""
    try:
        tess_env = os.environ.get("CEDOCUMENTMAPPER_TESSERACT_DIR")
        tess_dirs = []
        if tess_env:
            tess_dirs.append(Path(tess_env))
        tess_dirs.extend(
            [
                resource_path("tesseract"),
                Path(os.environ.get("ProgramFiles", "")) / "Tesseract-OCR",
                Path(os.environ.get("ProgramFiles(x86)", "")) / "Tesseract-OCR",
            ]
        )

        path_binary = shutil.which("tesseract")
        if path_binary:
            pytesseract.pytesseract.tesseract_cmd = path_binary
            return True

        for tess_dir in tess_dirs:
            if not tess_dir.exists():
                continue

            candidates = [
                tess_dir / "tesseract.exe",
                tess_dir / "tesseract",
            ]
            binary = next((c for c in candidates if c.exists()), None)
            if binary is None:
                continue

            pytesseract.pytesseract.tesseract_cmd = str(binary)
            tessdata = tess_dir / "tessdata"
            if tessdata.exists():
                os.environ["TESSDATA_PREFIX"] = str(tessdata)
            return True

        return False
    except Exception:
        return False


@contextlib.contextmanager
def _silence_stdout_fd():
    """Redirect OS-level stdout (fd 1) to devnull for the duration of the block.

    PyMuPDF's ``find_tables()`` prints an advisory line ("Consider using the
    pymupdf_layout package ...") straight to stdout. On the headless CLI that
    line would corrupt the machine-readable JSON written to stdout, so we
    suppress it at the file-descriptor level — capturing both Python-level
    prints and C-level writes from the underlying MuPDF library.
    """
    try:
        saved_fd = os.dup(1)
    except (OSError, ValueError):  # no real stdout fd (e.g. embedded host) — nothing to do
        yield
        return
    devnull_fd = None
    try:
        # os.open is inside the try so a failure here (e.g. fd exhaustion) still
        # runs the finally and closes saved_fd. sys.stdout can be None in an
        # embedded/windowed host even when fd 1 is valid, so guard the flushes.
        devnull_fd = os.open(os.devnull, os.O_WRONLY)
        if sys.stdout is not None:
            sys.stdout.flush()
        os.dup2(devnull_fd, 1)
        yield
    finally:
        if sys.stdout is not None:
            sys.stdout.flush()
        os.dup2(saved_fd, 1)
        if devnull_fd is not None:
            os.close(devnull_fd)
        os.close(saved_fd)


def _extract_page_tables(page, page_idx: int) -> tuple[tuple[Table, ...], str | None]:
    """Extract tables from a fitz page via ``find_tables`` if available.

    Returns ``(tables, note)`` where ``note`` is a free-text reason recorded when
    table extraction is unavailable or fails, else ``None``. Never raises: older
    PyMuPDF builds without ``find_tables``, or pages with no tables, degrade
    gracefully to an empty tuple.
    """
    if not hasattr(page, "find_tables"):
        return (), "Table extraction unavailable (PyMuPDF lacks find_tables)."

    try:
        tables: list[Table] = []
        # find_tables() emits an advisory to stdout; silence it so the CLI's
        # JSON output on stdout stays clean and machine-parseable.
        with _silence_stdout_fd():
            finder = page.find_tables()
            found = getattr(finder, "tables", []) or []
            for tbl in found:
                try:
                    extracted = tbl.extract() or []
                except Exception:
                    continue
                rows = tuple(
                    tuple("" if cell is None else str(cell) for cell in row)
                    for row in extracted
                )
                if not rows:
                    continue
                raw_bbox = getattr(tbl, "bbox", None)
                bbox = tuple(float(v) for v in raw_bbox) if raw_bbox else None
                tables.append(Table(rows=rows, bbox=bbox, page_index=page_idx))
        return tuple(tables), None
    except Exception as exc:  # pragma: no cover - defensive guard
        return (), f"Table extraction failed on page {page_idx + 1}: {exc}"


class PDFDocumentReader(DocumentReader):
    supported_extensions: frozenset[str] = frozenset([".pdf"])

    def __init__(self) -> None:
        configure_tesseract()

    def read(
        self,
        path: Path,
        *,
        force_ocr: bool = False,
        ocr_time_limit_seconds: float = OCR_TIME_LIMIT_SECONDS,
    ) -> DocumentModel:
        """Read a PDF into the canonical document model.

        Parameters
        ----------
        force_ocr:
            When True, the OCR fallback is run even if the heuristic page/image
            triggers would normally skip it (e.g. documents with more than
            ``OCR_PAGE_LIMIT`` pages, or with multiple images per page). This is
            the operator override path so OCR can be forced from the service.
        ocr_time_limit_seconds:
            Wall-clock budget for the whole OCR pass. OCR stops once exceeded and
            the cap is recorded in the reader notes.
        """
        if not path.exists():
            raise ReaderError(f"File not found: {path}")

        notes = []
        pages_list = []
        plain_text_parts = []

        try:
            doc = fitz.open(str(path))
        except Exception as exc:
            raise ReaderError(f"Could not open PDF with PyMuPDF: {exc}") from exc

        try:
            per_page_image_counts = []
            table_skip_note_added = False
            for page_idx, page in enumerate(doc):
                try:
                    per_page_image_counts.append(len(page.get_images() or []))
                except Exception:
                    per_page_image_counts.append(0)

                width = page.rect.width
                height = page.rect.height
                
                # Use dict mode to get styling and layout info
                text_dict = page.get_text("dict", sort=True)
                lines_list = []
                line_idx_counter = 0

                for block in text_dict.get("blocks", []):
                    if block.get("type") != 0:  # Skip image/non-text blocks
                        continue
                    
                    block_id = str(block.get("number", ""))
                    for line in block.get("lines", []):
                        bbox = line.get("bbox")  # (x0, y0, x1, y1)
                        line_text = ""
                        max_font_size = 0.0
                        is_bold = False
                        
                        spans = line.get("spans", [])
                        for span in spans:
                            span_text = span.get("text", "")
                            line_text += span_text
                            max_font_size = max(max_font_size, span.get("size", 0.0))
                            flags = span.get("flags", 0)
                            if flags & 16:  # bit 4 is bold
                                is_bold = True
                        
                        # Clean line text
                        line_text_cleaned = line_text.replace("\r", " ").replace("\t", " ").strip()
                        if line_text_cleaned:
                            lines_list.append(
                                DocumentLine(
                                    text=line_text_cleaned,
                                    page_index=page_idx,
                                    line_index=line_idx_counter,
                                    bbox=bbox,
                                    block_id=block_id,
                                    confidence=1.0,
                                )
                            )
                            line_idx_counter += 1

                # If PyMuPDF's dict mode returned no text, let's try get_text("text") as fallback
                if not lines_list:
                    fallback_text = page.get_text("text", sort=True) or ""
                    fallback_lines = [l.strip() for l in fallback_text.splitlines() if l.strip()]
                    for f_line in fallback_lines:
                        lines_list.append(
                            DocumentLine(
                                text=f_line,
                                page_index=page_idx,
                                line_index=line_idx_counter,
                                confidence=0.9,
                            )
                        )
                        line_idx_counter += 1

                page_tables, table_note = _extract_page_tables(page, page_idx)
                if table_note and not table_skip_note_added:
                    notes.append(table_note)
                    table_skip_note_added = True

                pages_list.append(
                    DocumentPage(
                        page_index=page_idx,
                        width=width,
                        height=height,
                        lines=tuple(lines_list),
                        tables=page_tables,
                    )
                )

                # Build page plain text
                page_text_combined = "\n".join(line.text for line in lines_list)
                plain_text_parts.append(page_text_combined)

            combined_text = "\n\n".join(plain_text_parts).strip()

            # OCR fallback checks. The historical heuristic only fires for short,
            # one-image-per-page scans with no selectable text. We evaluate the
            # individual conditions so that when OCR is *skipped* we can record an
            # explicit reason, and so an operator can force it via force_ocr.
            page_count = len(per_page_image_counts)
            heuristic_reasons: list[str] = []
            if combined_text:
                heuristic_reasons.append("selectable text was already extracted")
            if not (0 < page_count <= OCR_PAGE_LIMIT):
                heuristic_reasons.append(
                    f"page count {page_count} is outside the OCR limit of {OCR_PAGE_LIMIT}"
                )
            if not all(count == 1 for count in per_page_image_counts):
                heuristic_reasons.append("not every page has exactly one image")

            heuristic_ocr = not heuristic_reasons
            should_ocr = heuristic_ocr or force_ocr

            if not should_ocr:
                reason = "; ".join(heuristic_reasons) or "OCR heuristic not met"
                notes.append(
                    f"OCR skipped ({reason}). Set the OCR override to force OCR."
                )
            elif force_ocr and not heuristic_ocr:
                reason = "; ".join(heuristic_reasons) or "OCR heuristic not met"
                notes.append(
                    f"OCR forced via override despite skip heuristic ({reason})."
                )

            if should_ocr:
                notes.append("Selectable text empty. Initiating OCR fallback.")
                ocr_pages = []
                ocr_lines_list = []
                ocr_start = time.monotonic()
                ocr_timed_out = False
                ocr_page_failed = False

                for page_idx, page in enumerate(doc):
                    if time.monotonic() - ocr_start > ocr_time_limit_seconds:
                        ocr_timed_out = True
                        notes.append(
                            f"OCR aborted after exceeding the wall-clock time cap of "
                            f"{ocr_time_limit_seconds:g}s (stopped at page {page_idx + 1})."
                        )
                        break
                    try:
                        # Render page to high-res image
                        pix = page.get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72))
                        img_data = pix.tobytes("png")
                        img = PILImage.open(io.BytesIO(img_data))

                        # Perform OCR
                        page_ocr = pytesseract.image_to_string(img, lang="eng") or ""
                        page_ocr_lines = [l.strip() for l in page_ocr.splitlines() if l.strip()]

                        page_lines = []
                        for line_idx, line_text in enumerate(page_ocr_lines):
                            page_lines.append(
                                DocumentLine(
                                    text=line_text,
                                    page_index=page_idx,
                                    line_index=line_idx,
                                    confidence=0.7,
                                )
                            )

                        ocr_lines_list.append(page_lines)
                        ocr_pages.append("\n".join(page_ocr_lines))
                    except Exception as ocr_exc:
                        ocr_page_failed = True
                        notes.append(f"OCR failed on page {page_idx + 1}: {ocr_exc}")
                        break

                # Salvage whatever OCR produced. A wall-clock timeout or a per-page
                # failure breaks out of the loop above; the historical for/else only
                # combined the pages when NO break happened, so a timeout silently
                # discarded every page OCR'd before the cap and left combined_text
                # empty. Instead, combine all pages that DID OCR (``ocr_lines_list``
                # only ever holds the successful ones), so a partial pass still
                # returns its text. ``ocr_timed_out`` / ``ocr_page_failed`` are read
                # here to record whether the result is full or truncated.
                if ocr_lines_list:
                    # Preserve any tables already discovered during the text pass.
                    prior_tables = {p.page_index: p.tables for p in pages_list}
                    pages_list = []
                    for page_idx, p_lines in enumerate(ocr_lines_list):
                        pages_list.append(
                            DocumentPage(
                                page_index=page_idx,
                                width=doc[page_idx].rect.width,
                                height=doc[page_idx].rect.height,
                                lines=tuple(p_lines),
                                tables=prior_tables.get(page_idx, ()),
                            )
                        )
                    combined_text = "\n\n".join(ocr_pages).strip()
                    if ocr_timed_out or ocr_page_failed:
                        notes.append(
                            f"Read PDF using OCR fallback (PARTIAL — "
                            f"{len(ocr_lines_list)} of {len(per_page_image_counts)} "
                            f"page(s) OCR'd before OCR stopped)."
                        )
                    else:
                        notes.append("Read PDF using OCR fallback.")

        finally:
            doc.close()

        # If PyMuPDF returned absolutely nothing (and we didn't do OCR), try pypdf fallback
        if not combined_text:
            try:
                reader = PdfReader(str(path))
                pypdf_pages = []
                pypdf_plain_text = []
                for page_idx, page in enumerate(reader.pages):
                    page_text = page.extract_text() or ""
                    # Handle custom escape seq decoding
                    page_text = re.sub(r"/uni([0-9A-Fa-f]{4})", lambda m: chr(int(m.group(1), 16)), page_text)
                    pypdf_page_lines = [l.strip() for l in page_text.splitlines() if l.strip()]
                    
                    lines_list = []
                    for line_idx, line_text in enumerate(pypdf_page_lines):
                        lines_list.append(
                            DocumentLine(
                                text=line_text,
                                page_index=page_idx,
                                line_index=line_idx,
                                confidence=0.8,
                            )
                        )
                    
                    pypdf_pages.append(
                        DocumentPage(
                            page_index=page_idx,
                            lines=tuple(lines_list),
                        )
                    )
                    pypdf_plain_text.append("\n".join(pypdf_page_lines))
                
                combined_text = "\n\n".join(pypdf_plain_text).strip()
                if combined_text:
                    pages_list = pypdf_pages
                    notes.append("Read PDF using pypdf fallback.")
            except Exception as pypdf_exc:
                notes.append(f"pypdf fallback failed: {pypdf_exc}")

        return DocumentModel(
            source_path=path,
            source_type="pdf",
            pages=tuple(pages_list),
            plain_text=combined_text,
            reader_notes=tuple(notes),
            metadata={
                "raw_text": combined_text,
                "raw_lines": combined_text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if combined_text else [],
                "page_count": len(pages_list),
                "ocr_page_limit": OCR_PAGE_LIMIT,
                "ocr_time_limit_seconds": ocr_time_limit_seconds,
                "ocr_forced": force_ocr,
            },
        )
