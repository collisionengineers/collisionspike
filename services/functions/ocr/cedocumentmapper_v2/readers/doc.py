from __future__ import annotations

import re
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    DocumentPage,
    DocumentLine,
)
from cedocumentmapper_v2.readers.base import DocumentReader
from cedocumentmapper_v2.readers.errors import ReaderError, DependencyMissingError
from cedocumentmapper_v2.readers.docx import DocxDocumentReader


class DocDocumentReader(DocumentReader):
    supported_extensions: frozenset[str] = frozenset([".doc"])

    def read(self, path: Path) -> DocumentModel:
        if not path.exists():
            raise ReaderError(f"File not found: {path}")

        notes = []
        
        # Method 1: parse the Word 97+ OLE piece table in-process. This is the
        # deployment path: it needs no Word/LibreOffice/antiword executable and
        # retains table-cell text that a blind binary scrape commonly drops.
        try:
            text = self._read_via_ole_piece_table(path)
            notes.append("Read DOC using the embedded Word piece table.")
            return self._build_model_from_text(path, text, notes)
        except Exception as piece_table_exc:
            notes.append(f"Word piece-table extraction failed: {piece_table_exc}")

        # Method 2: try readable embedded streams. This also handles RTF files
        # whose extension is .DOC, a common legacy export in the source corpus.
        try:
            text = self._read_via_binary_text_scrape(path)
            if self._scrape_text_is_incomplete(text):
                raise ReaderError("Embedded text scrape produced incomplete DOC text.")
            notes.append("Read DOC using embedded text scrape fallback.")
            return self._build_model_from_text(path, text, notes)
        except Exception as scrape_exc:
            notes.append(f"Embedded text scrape failed: {scrape_exc}")

        # Method 3: Try Microsoft Word COM Automation
        try:
            text = self._read_via_word_com(path)
            notes.append("Read DOC using Microsoft Word automation.")
            return self._build_model_from_text(path, text, notes)
        except Exception as com_exc:
            notes.append(f"Word COM extraction failed: {com_exc}")

        # Method 4: Try LibreOffice head-less docx conversion
        try:
            text = self._read_via_libreoffice(path)
            notes.append("Read DOC using LibreOffice conversion.")
            return self._build_model_from_text(path, text, notes)
        except Exception as lo_exc:
            notes.append(f"LibreOffice conversion failed: {lo_exc}")

        # Method 5: Try antiword text extraction for old binary DOC files.
        try:
            text = self._read_via_antiword(path)
            notes.append("Read DOC using antiword fallback.")
            notes.append(
                "Warning: antiword does not extract headers/footers; "
                "header/footer content may be incomplete or missing."
            )
            return self._build_model_from_text(path, text, notes)
        except Exception as antiword_exc:
            notes.append(f"antiword extraction failed: {antiword_exc}")

        raise ReaderError(
            "Could not read DOC as a Word 97+ binary document or RTF export, and no "
            "desktop conversion fallback succeeded."
        )

    @staticmethod
    def _unpack_u16(data: bytes, offset: int, label: str) -> int:
        if offset < 0 or offset + 2 > len(data):
            raise ReaderError(f"DOC {label} offset is outside its stream.")
        return int(struct.unpack_from("<H", data, offset)[0])

    @staticmethod
    def _unpack_u32(data: bytes, offset: int, label: str) -> int:
        if offset < 0 or offset + 4 > len(data):
            raise ReaderError(f"DOC {label} offset is outside its stream.")
        return int(struct.unpack_from("<I", data, offset)[0])

    def _read_via_ole_piece_table(self, path: Path) -> str:
        """Read Word 97+ binary text from the CLX piece table (MS-DOC).

        The piece table is the document's authoritative mapping from logical
        character positions to byte ranges in the ``WordDocument`` stream. It
        therefore retains table-cell text that is not recoverable by scanning
        for printable byte runs. Bounds are validated before every allocation
        and slice because instruction documents are untrusted input.
        """
        try:
            import olefile
        except ImportError as exc:
            raise DependencyMissingError("olefile is not installed.") from exc

        if not olefile.isOleFile(path):
            raise ReaderError("File is not an OLE compound Word document.")

        ole = olefile.OleFileIO(path)
        try:
            if not ole.exists("WordDocument"):
                raise ReaderError("OLE document has no WordDocument stream.")
            word_stream = ole.openstream("WordDocument").read()

            if len(word_stream) < 34 or self._unpack_u16(word_stream, 0, "FIB magic") != 0xA5EC:
                raise ReaderError("WordDocument stream has an invalid file-information block.")

            n_fib = self._unpack_u16(word_stream, 2, "FIB version")
            if n_fib < 0x00C1:
                raise ReaderError("Pre-Word-97 binary DOC is not supported by the piece-table reader.")

            fib_flags = self._unpack_u16(word_stream, 0x0A, "FIB flags")
            if fib_flags & 0x0100:
                raise ReaderError("Encrypted legacy DOC files cannot be read.")
            table_name = "1Table" if fib_flags & 0x0200 else "0Table"
            if not ole.exists(table_name):
                raise ReaderError(f"OLE document has no {table_name} stream.")
            table_stream = ole.openstream(table_name).read()
        finally:
            ole.close()

        # The FIB's variable-length sections lead to FibRgFcLcb. Entry 33 is
        # fcClx/lcbClx for Word 97 and later. Do not use hard-coded absolute
        # offsets: later Word versions extend the preceding sections.
        fib_offset = 32
        csw = self._unpack_u16(word_stream, fib_offset, "csw")
        fib_offset += 2 + csw * 2
        cslw = self._unpack_u16(word_stream, fib_offset, "cslw")
        fib_offset += 2 + cslw * 4
        cb_rg_fc_lcb = self._unpack_u16(word_stream, fib_offset, "cbRgFcLcb")
        fib_offset += 2
        clx_pair_index = 33
        if cb_rg_fc_lcb <= clx_pair_index:
            raise ReaderError("DOC file-information block has no CLX entry.")

        clx_entry = fib_offset + clx_pair_index * 8
        fc_clx = self._unpack_u32(word_stream, clx_entry, "fcClx")
        lcb_clx = self._unpack_u32(word_stream, clx_entry + 4, "lcbClx")
        if lcb_clx < 5 or fc_clx + lcb_clx > len(table_stream):
            raise ReaderError("DOC CLX range is outside the selected table stream.")
        clx = table_stream[fc_clx : fc_clx + lcb_clx]

        # CLX contains zero or more formatting PRCs (0x01) followed by one
        # Pcdt (0x02). Only the Pcdt carries the character-piece mapping.
        clx_offset = 0
        while clx_offset < len(clx) and clx[clx_offset] == 0x01:
            prc_size = self._unpack_u16(clx, clx_offset + 1, "CLX PRC length")
            clx_offset += 3 + prc_size
        if clx_offset >= len(clx) or clx[clx_offset] != 0x02:
            raise ReaderError("DOC CLX has no piece-table record.")

        plc_size = self._unpack_u32(clx, clx_offset + 1, "piece-table length")
        plc_start = clx_offset + 5
        if plc_size < 16 or plc_start + plc_size > len(clx) or (plc_size - 4) % 12:
            raise ReaderError("DOC piece-table length is invalid.")
        plc = clx[plc_start : plc_start + plc_size]
        piece_count = (plc_size - 4) // 12
        if piece_count < 1 or piece_count > 100_000:
            raise ReaderError("DOC piece count is outside the supported range.")

        cp_count = piece_count + 1
        cp_bytes = cp_count * 4
        character_positions = [
            self._unpack_u32(plc, index * 4, "piece character position")
            for index in range(cp_count)
        ]
        if character_positions[0] != 0:
            raise ReaderError("DOC piece table does not start at character position zero.")
        if any(
            right < left
            for left, right in zip(character_positions, character_positions[1:])
        ):
            raise ReaderError("DOC piece character positions are not monotonic.")
        if character_positions[-1] > 20_000_000:
            raise ReaderError("DOC text exceeds the supported character limit.")

        pieces: list[str] = []
        for index in range(piece_count):
            pcd_offset = cp_bytes + index * 8
            raw_fc = self._unpack_u32(plc, pcd_offset + 2, "piece file offset")
            compressed = bool(raw_fc & 0x40000000)
            file_offset = raw_fc & 0x3FFFFFFF
            if compressed:
                file_offset //= 2

            character_count = character_positions[index + 1] - character_positions[index]
            byte_count = character_count if compressed else character_count * 2
            if file_offset + byte_count > len(word_stream):
                raise ReaderError("DOC text piece is outside the WordDocument stream.")

            encoded = word_stream[file_offset : file_offset + byte_count]
            encoding = "cp1252" if compressed else "utf-16le"
            pieces.append(encoded.decode(encoding, errors="replace"))

        text = self._normalise_word_binary_text("".join(pieces))
        if not text.strip() or not any(character.isalpha() for character in text):
            raise ReaderError("DOC piece table contained no readable text.")
        return text

    @staticmethod
    def _normalise_word_binary_text(value: str) -> str:
        """Turn Word story/table controls into a stable, readable line stream."""
        text = value.replace("\u00a0", " ")
        # Paragraph, hard-line, page and table-cell delimiters all represent a
        # safe extraction boundary. Field/picture controls carry no visible text.
        text = text.translate(
            {
                0x01: None,
                0x07: "\n",
                0x08: None,
                0x0B: "\n",
                0x0C: "\n",
                0x0D: "\n",
                0x13: None,
                0x14: None,
                0x15: None,
            }
        )
        text = "".join(
            character
            if character in "\n\t" or ord(character) >= 0x20
            else " "
            for character in text
        )
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _read_via_word_com(self, path: Path) -> str:
        try:
            import pythoncom
            from win32com.client import DispatchEx
        except ImportError as exc:
            raise DependencyMissingError("pywin32 / pythoncom is not installed.") from exc

        def clean_line_win32(text: str) -> str:
            text = (text or "").replace("\r\x07", "\n").replace("\x07", "")
            text = text.replace("\r", "\n")
            return text

        pythoncom.CoInitialize()
        word = None
        doc = None
        try:
            word = DispatchEx("Word.Application")
            word.Visible = False
            word.DisplayAlerts = 0
            doc = word.Documents.Open(
                str(path.resolve()),
                ConfirmConversions=False,
                ReadOnly=True,
                AddToRecentFiles=False,
                Visible=False,
            )

            header_lines = []
            footer_lines = []
            seen_header = set()
            seen_footer = set()

            for section_index in range(1, doc.Sections.Count + 1):
                section = doc.Sections(section_index)
                for hf_type in (1, 2, 3):
                    try:
                        header_text = section.Headers(hf_type).Range.Text or ""
                    except Exception:
                        header_text = ""
                    header_text = clean_line_win32(header_text)
                    for raw_line in header_text.splitlines():
                        cleaned = raw_line.strip(" :\n")
                        if cleaned and cleaned.lower() not in seen_header:
                            header_lines.append(cleaned)
                            seen_header.add(cleaned.lower())

                    try:
                        footer_text = section.Footers(hf_type).Range.Text or ""
                    except Exception:
                        footer_text = ""
                    footer_text = clean_line_win32(footer_text)
                    for raw_line in footer_text.splitlines():
                        cleaned = raw_line.strip(" :\n")
                        if cleaned and cleaned.lower() not in seen_footer:
                            footer_lines.append(cleaned)
                            seen_footer.add(cleaned.lower())

            body_text = doc.Content.Text or ""
            body_text = clean_line_win32(body_text)

            parts = []
            if header_lines:
                parts.append("\n".join(header_lines))
            if body_text.strip():
                parts.append(body_text)
            if footer_lines:
                parts.append("\n".join(footer_lines))

            return "\n\n".join(parts).strip()

        finally:
            if doc is not None:
                try:
                    doc.Close(False)
                except Exception:
                    pass
            if word is not None:
                try:
                    word.Quit()
                except Exception:
                    pass
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass

    def _read_via_libreoffice(self, path: Path) -> str:
        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            raise DependencyMissingError("LibreOffice/soffice executable not found on PATH.")

        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            command = [
                soffice,
                "--headless",
                "--convert-to",
                "docx",
                "--outdir",
                str(output_dir),
                str(path.resolve()),
            ]
            subprocess.run(command, check=True, capture_output=True, timeout=30)
            docx_candidates = list(output_dir.glob("*.docx"))
            if not docx_candidates:
                raise ReaderError("LibreOffice did not output a converted .docx file.")
            
            # Read via the DocxDocumentReader we wrote
            docx_reader = DocxDocumentReader()
            doc_model = docx_reader.read(docx_candidates[0])
            return doc_model.plain_text

    def _read_via_antiword(self, path: Path) -> str:
        antiword = shutil.which("antiword")
        if not antiword:
            raise DependencyMissingError("antiword executable not found on PATH.")
        result = subprocess.run(
            [antiword, str(path.resolve())],
            check=True,
            capture_output=True,
            timeout=30,
        )
        text = result.stdout.decode("utf-8", errors="ignore")
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        if not text.strip():
            raise ReaderError("antiword returned no readable text.")
        return text

    def _read_via_binary_text_scrape(self, path: Path) -> str:
        # Try to parse via olefile to extract the WordDocument stream cleanly
        data = None
        try:
            import olefile
            if olefile.isOleFile(path):
                ole = olefile.OleFileIO(path)
                if ole.exists("WordDocument"):
                    data = ole.openstream("WordDocument").read()
        except Exception:
            pass

        if data is None:
            data = path.read_bytes()

        rtf_index = data.find(b"{\\rtf")
        if 0 <= rtf_index < 4096:
            rtf_text = data[rtf_index:].decode("cp1252", errors="ignore")
            stripped = self._strip_rtf_markup(rtf_text)
            stripped_lines = [
                line.strip()
                for line in stripped.splitlines()
                if self._looks_like_human_text(line.strip())
            ]
            if len("\n".join(stripped_lines)) >= 80:
                return "\n".join(stripped_lines)

        ascii_runs = [
            match.group(0).decode("cp1252", errors="ignore")
            for match in re.finditer(rb"[\x09\x0a\x0d\x20-\x7e\xa0-\xff]{4,}", data)
        ]
        utf16_text = data.decode("utf-16le", errors="ignore")
        utf16_runs = re.findall(r"[\t\r\n -~£]{4,}", utf16_text)

        lines: list[str] = []
        seen = set()
        for chunk in ascii_runs + utf16_runs:
            chunk = chunk.replace("\r\n", "\n").replace("\r", "\n")
            chunk = re.sub(r"[^\S\n]+", " ", chunk)
            for raw_line in chunk.splitlines():
                line = raw_line.strip(" \t\x00")
                if not self._looks_like_human_text(line):
                    continue
                key = line.lower()
                if key not in seen:
                    seen.add(key)
                    lines.append(line)

        text = "\n".join(lines)
        if len(text) < 80:
            raise ReaderError("No useful embedded DOC text found.")
        return text

    def _strip_rtf_markup(self, value: str) -> str:
        text = value
        text = re.sub(r"\\'[0-9a-fA-F]{2}", lambda m: bytes([int(m.group(0)[2:], 16)]).decode("cp1252", errors="ignore"), text)
        text = text.replace("\\rquote", "'").replace("\\lquote", "'")
        text = text.replace("\\ldblquote", '"').replace("\\rdblquote", '"')
        text = re.sub(r"\\(par|line)\b[^\S\n]*", "\n", text)
        text = re.sub(r"\\tab\b[^\S\n]*", "\t", text)
        text = re.sub(r"{\\\*\\themedata\s+[0-9A-Fa-f\s]+}", " ", text)
        text = re.sub(r"{\\\*[^{}]*(?:{[^{}]*}[^{}]*)*}", " ", text)
        text = re.sub(r"{\\(?:fonttbl|colortbl|stylesheet|listtable|listoverridetable|datastore|xmlnstbl)[\s\S]*?}\s*", " ", text)
        text = re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", text)
        text = re.sub(r"\\[^a-zA-Z]", " ", text)
        text = text.replace("{", " ").replace("}", " ")
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _scrape_text_is_incomplete(self, text: str) -> bool:
        """Return True when scraped text looks truncated or polluted."""
        if not text.strip():
            return True

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return True

        binary_markers = ("ihdr", "idat", "png", "bjbj")
        marker_hits = sum(
            1 for line in lines if any(marker in line.lower() for marker in binary_markers)
        )
        if marker_hits >= 3:
            return True

        if re.search(
            r"(?is)\baccident circumstances\s*:?\s*(?:\r?\n\s*)+damage description\s*:?",
            text,
        ):
            return True

        return False

    def _looks_like_human_text(self, value: str) -> bool:
        if len(value) < 2 or len(value) > 220:
            return False
        lowered = value.lower()
        if "bjbj" in lowered or "\\" in value:
            return False
        if lowered in {"ihdr", "idat", "idatx", "png", "putt"}:
            return False
        if re.fullmatch(r"[A-Za-z0-9+/=]{4,8}", value):
            return False
        if any(c in value for c in "?!%*"):
            return False
            
        allowed_chars = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \t.,:;/-_()&'@£#\"+=<>[]\u2018\u2019\u201c\u201d\u2013\u2014\u2011áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛñÑ")
        if not all(c in allowed_chars for c in value):
            return False

        words = value.split()
        if len(words) == 1:
            w = words[0].lower()
            if not any(v in w for v in "aeiouy") and not any(c.isdigit() for c in w):
                return False

        letters = sum(ch.isalpha() for ch in value)
        digits = sum(ch.isdigit() for ch in value)
        if letters + digits < 2:
            return False
        return True

    def _build_model_from_text(self, path: Path, text: str, notes: list[str]) -> DocumentModel:
        lines_list = []
        seen = set()
        line_idx = 0
        for raw_line in text.splitlines():
            cleaned = raw_line.replace("\r", " ").replace("\t", " ").strip()
            if not cleaned:
                continue
            lowered = cleaned.lower()
            if lowered not in seen:
                lines_list.append(
                    DocumentLine(
                        text=cleaned,
                        page_index=0,
                        line_index=line_idx,
                        confidence=1.0,
                    )
                )
                seen.add(lowered)
                line_idx += 1

        page = DocumentPage(
            page_index=0,
            lines=tuple(lines_list),
        )

        return DocumentModel(
            source_path=path,
            source_type="doc",
            pages=(page,),
            plain_text="\n".join(line.text for line in lines_list),
            reader_notes=tuple(notes),
            metadata={
                "raw_text": text,
                "raw_lines": text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if text else [],
            },
        )
