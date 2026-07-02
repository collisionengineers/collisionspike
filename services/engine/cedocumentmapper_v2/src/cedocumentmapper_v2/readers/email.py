from __future__ import annotations

import re
from pathlib import Path
from email import policy
from email.parser import BytesParser
from html import unescape as html_unescape

import extract_msg

from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    DocumentPage,
    DocumentLine,
)
from cedocumentmapper_v2.readers.base import DocumentReader
from cedocumentmapper_v2.readers.errors import ReaderError


class EmailDocumentReader(DocumentReader):
    supported_extensions: frozenset[str] = frozenset([".eml", ".msg"])

    def read(self, path: Path) -> DocumentModel:
        if not path.exists():
            raise ReaderError(f"File not found: {path}")

        ext = path.suffix.lower()
        notes = []

        try:
            if ext == ".eml":
                text, reader_notes = self._read_eml(path)
                notes.extend(reader_notes)
            elif ext == ".msg":
                text, reader_notes = self._read_msg(path)
                notes.extend(reader_notes)
            else:
                raise ReaderError(f"Unsupported email format: {ext}")
        except Exception as exc:
            raise ReaderError(f"Could not read email: {exc}") from exc

        # Create single page for email documents
        lines_list = []
        seen = set()
        for idx, raw_line in enumerate(text.splitlines()):
            cleaned = raw_line.replace("\r", " ").replace("\t", " ").strip()
            if not cleaned:
                continue
            lowered = cleaned.lower()
            if lowered not in seen:
                lines_list.append(
                    DocumentLine(
                        text=cleaned,
                        page_index=0,
                        line_index=idx,
                        confidence=1.0,
                    )
                )
                seen.add(lowered)

        page = DocumentPage(
            page_index=0,
            lines=tuple(lines_list),
        )

        return DocumentModel(
            source_path=path,
            source_type="eml" if ext == ".eml" else "msg",
            pages=(page,),
            plain_text="\n".join(l.text for l in lines_list),
            reader_notes=tuple(notes),
            metadata={
                "raw_text": text,
                "raw_lines": text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if text else [],
                "email_source_type": ext.lstrip("."),
            },
        )

    def _attachment_text(self, name: str, data: object) -> str:
        """Extract the plain text of a nested instruction attachment (PDF/DOCX/DOC).

        A forwarded/attached instruction inside an .eml/.msg used to be NAMED only —
        its fields (provider, claimant, dates, model, circumstances) were never read.
        This reads the attachment bytes through the matching reader so those fields are
        extracted too. Best-effort: unsupported types and ANY failure return "" — an
        unreadable nested file must never fail the surrounding email parse. Only one
        level deep (no .eml/.msg recursion)."""
        if not isinstance(data, (bytes, bytearray)) or not data:
            return ""
        suffix = Path(name).suffix.lower()
        if suffix not in (".pdf", ".docx", ".doc"):
            return ""
        import os
        import tempfile

        # Lazy import avoids the readers/__init__ <-> email circular import at module load.
        from cedocumentmapper_v2.readers import get_reader_for_path

        tmp_path: str | None = None
        try:
            fd, tmp_path = tempfile.mkstemp(suffix=suffix)
            with os.fdopen(fd, "wb") as fh:
                fh.write(bytes(data))
            reader = get_reader_for_path(Path(tmp_path))
            model = reader.read(Path(tmp_path))
            return (model.plain_text or "").strip()
        except Exception:
            return ""
        finally:
            if tmp_path:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def _read_eml(self, path: Path) -> tuple[str, list[str]]:
        notes = ["Read EML using email standard parser."]
        with open(path, "rb") as fh:
            msg = BytesParser(policy=policy.default).parse(fh)

        parts = []
        for header in ("Subject", "From", "To", "Date"):
            value = msg.get(header)
            if value:
                parts.append(f"{header}: {value}")
        if parts:
            parts.append("")

        body_parts = []
        html_parts = []
        attachment_names: list[str] = []
        attachment_texts: list[tuple[str, str]] = []
        if msg.is_multipart():
            for part in msg.walk():
                disposition = str(part.get_content_disposition() or "").lower()
                if disposition == "attachment":
                    # Preserve attachment names for parity with the MSG path, AND read
                    # the bytes of a nested instruction document so its fields are
                    # extracted, not just the filename (best-effort).
                    name = part.get_filename()
                    if name:
                        name = str(name).strip()
                        attachment_names.append(name)
                        nested = self._attachment_text(name, part.get_payload(decode=True))
                        if nested:
                            attachment_texts.append((name, nested))
                    continue
                ctype = part.get_content_type()
                try:
                    payload = part.get_content()
                except Exception:
                    try:
                        payload = part.get_payload(decode=True)
                        if isinstance(payload, bytes):
                            payload = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
                    except Exception:
                        payload = ""
                if not isinstance(payload, str):
                    continue
                if ctype == "text/plain":
                    body_parts.append(payload)
                elif ctype == "text/html":
                    html_parts.append(payload)
        else:
            payload = msg.get_content()
            if isinstance(payload, str):
                if msg.get_content_type() == "text/html":
                    html_parts.append(payload)
                else:
                    body_parts.append(payload)

        body = "\n\n".join(part.strip() for part in body_parts if part and part.strip())
        if not body and html_parts:
            body = "\n\n".join(self._strip_html_tags(part) for part in html_parts if part and part.strip())
        if body:
            parts.append(body.strip())

        attachment_names = [name for name in attachment_names if name]
        if attachment_names:
            parts.append("")
            parts.append("Attachments: " + ", ".join(attachment_names))

        # Append the extracted text of nested instruction documents so the rule engine
        # sees the full instruction content (forwarded/attached instruction case).
        for att_name, att_text in attachment_texts:
            parts.append("")
            parts.append(f"--- Attachment content: {att_name} ---")
            parts.append(att_text)

        text = "\n".join(parts)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip(), notes

    def _read_msg(self, path: Path) -> tuple[str, list[str]]:
        notes = ["Read MSG using extract_msg."]
        msg = extract_msg.Message(str(path))  # type: ignore[no-untyped-call]

        def _coerce(value: object) -> str:
            if value is None:
                return ""
            if isinstance(value, bytes):
                for encoding in ("utf-8", "cp1252", "latin-1"):
                    try:
                        return value.decode(encoding).replace("\x00", "").strip()
                    except UnicodeDecodeError:
                        continue
                return value.decode("utf-8", errors="ignore").replace("\x00", "").strip()
            return str(value).replace("\x00", "").strip()

        try:
            parts = []
            for label, attr in (
                ("Subject", "subject"),
                ("From", "sender"),
                ("To", "to"),
                ("Cc", "cc"),
                ("Date", "date"),
            ):
                try:
                    value = _coerce(getattr(msg, attr, None))
                except Exception:
                    value = ""
                if value:
                    parts.append(f"{label}: {value}")
            if parts:
                parts.append("")

            # Body processing
            body = ""
            try:
                body = _coerce(getattr(msg, "body", None))
            except Exception:
                pass

            def _looks_like_html(text: str) -> bool:
                if not text:
                    return False
                head = text.lstrip()[:200].lower()
                return ("<html" in head or "<body" in head or "<!doctype" in head
                        or "<o:p" in head or "<v:" in head)

            if body and _looks_like_html(body):
                body = self._strip_html_tags(body)
            
            if not body:
                try:
                    html = _coerce(getattr(msg, "htmlBody", None))
                    if html:
                        body = self._strip_html_tags(html)
                except Exception:
                    pass

            if not body:
                try:
                    rtf_bytes = getattr(msg, "rtfBody", None)
                    if rtf_bytes:
                        if isinstance(rtf_bytes, bytes):
                            rtf_text = rtf_bytes.decode("utf-8", errors="ignore")
                        else:
                            rtf_text = str(rtf_bytes)
                        body = self._strip_rtf_markup(rtf_text)
                except Exception:
                    pass

            if body:
                parts.append(body.strip())

            # Attachments
            attachment_names = []
            attachment_texts: list[tuple[str, str]] = []
            try:
                attachments = list(getattr(msg, "attachments", []) or [])
                for att in attachments:
                    name = ""
                    for candidate_attr in ("longFilename", "shortFilename", "displayName"):
                        try:
                            candidate = getattr(att, candidate_attr, None)
                        except Exception:
                            candidate = None
                        if candidate is not None:
                            name = _coerce(candidate)
                            if name:
                                break
                    if name:
                        attachment_names.append(name)
                        # Read a nested instruction document's bytes so its fields are
                        # extracted too, not just its name (best-effort).
                        try:
                            att_data = getattr(att, "data", None)
                        except Exception:
                            att_data = None
                        nested = self._attachment_text(name, att_data)
                        if nested:
                            attachment_texts.append((name, nested))
            except Exception:
                pass

            if attachment_names:
                parts.append("")
                parts.append("Attachments: " + ", ".join(attachment_names))

            for att_name, att_text in attachment_texts:
                parts.append("")
                parts.append(f"--- Attachment content: {att_name} ---")
                parts.append(att_text)

            text = "\n".join(parts)
            text = text.replace("\r\n", "\n").replace("\r", "\n")
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text.strip(), notes

        finally:
            msg.close()

    @staticmethod
    def _strip_html_tags(value: str) -> str:
        if not value:
            return ""

        cp1252_singles = {
            "\x91": "'", "\x92": "'", "\x93": '"', "\x94": '"',
            "\x96": "-", "\x97": "-", "\x85": "...",
        }
        for raw, replacement in cp1252_singles.items():
            value = value.replace(raw, replacement)

        value = re.sub(r"<style[^>]*>.*?</style\s*>", " ", value, flags=re.I | re.S)
        value = re.sub(r"<script[^>]*>.*?</script\s*>", " ", value, flags=re.I | re.S)
        value = re.sub(r"<!--.*?-->", " ", value, flags=re.S)
        value = re.sub(r"<\?xml[^>]*\?>", " ", value, flags=re.I)
        value = re.sub(r"<!doctype[^>]*>", " ", value, flags=re.I)

        value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
        value = re.sub(r"</(p|div|tr|li|h[1-6])\s*>", "\n", value, flags=re.I)
        value = re.sub(r"</td\s*>", "\t", value, flags=re.I)
        value = re.sub(r"<[^>]+>", " ", value)

        value = html_unescape(value)
        value = value.replace("\u00a0", " ")
        value = value.replace("\x00", "")

        value = re.sub(r"\n{3,}", "\n\n", value)
        value = re.sub(r"[ \t]{2,}", " ", value)
        return value.strip()

    @staticmethod
    def _strip_rtf_markup(rtf: str) -> str:
        if not rtf:
            return ""
        text = re.sub(r"\\bin\d+\s+\S*", " ", rtf)
        text = re.sub(r"\\'([0-9A-Fa-f]{2})",
                      lambda m: bytes([int(m.group(1), 16)]).decode("cp1252", errors="ignore"),
                      text)
        text = re.sub(r"\\[a-zA-Z]+-?\d*\s?", " ", text)
        text = re.sub(r"\\[^a-zA-Z]", "", text)
        text = text.replace("{", " ").replace("}", " ")
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
