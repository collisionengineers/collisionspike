#!/usr/bin/env python3
"""Scan decoded repository documents and messages for configured signatures."""

from __future__ import annotations

from email import policy
from email.parser import BytesParser
import html
import io
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Iterable
import zipfile

import extract_msg
from pypdf import PdfReader

# The hashed-signature matcher is a cross-language mirror of
# scripts/checks/hashed-signature-matcher.mjs; both consume forbidden-signatures.json
# and are pinned to identical results by scripts/checks/forbidden-signature-vectors.json.
# See scripts/checks/forbidden-signature-matcher-parity.md.
from hashed_signature_matcher import create_hashed_signature_matcher


ROOT = Path(__file__).resolve().parents[2]
SIGNATURE_PATH = ROOT / "scripts" / "checks" / "forbidden-signatures.json"
SCANNED_EXTENSIONS = {
    ".doc",
    ".docm",
    ".docx",
    ".eml",
    ".msg",
    ".pdf",
    ".ppt",
    ".pptm",
    ".pptx",
    ".xls",
    ".xlsm",
    ".xlsx",
    ".zip",
}
TEXT_EXTENSIONS = {".csv", ".htm", ".html", ".json", ".md", ".txt", ".xml"}
OFFICE_EXTENSIONS = {".docm", ".docx", ".pptm", ".pptx", ".xlsm", ".xlsx"}
IMAGE_EXTENSIONS = {".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"}
MAX_ENTRY_BYTES = 64 * 1024 * 1024
MAX_DEPTH = 4

logging.getLogger("pypdf").setLevel(logging.ERROR)


# The forbidden vocabulary lives once in forbidden-signatures.json; the matcher
# algorithm is shared with the Node consumer via the hashed_signature_matcher mirror.
_SIGNATURE_DOCUMENT = json.loads(SIGNATURE_PATH.read_text(encoding="utf-8"))
matches = create_hashed_signature_matcher(_SIGNATURE_DOCUMENT)


def repository_files() -> list[Path]:
    configured = os.environ.get("CS_BINARY_SCAN_EXTENSIONS", "").strip()
    extensions = (
        {value.strip().casefold() for value in configured.split(",") if value.strip()}
        if configured
        else SCANNED_EXTENSIONS
    )
    completed = subprocess.run(
        ["git", "ls-files", "-co", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    paths = []
    for raw in completed.stdout.split(b"\0"):
        if not raw:
            continue
        path = ROOT / raw.decode("utf-8", errors="surrogateescape")
        if path.is_file() and path.suffix.casefold() in extensions:
            paths.append(path)
    return sorted(set(paths))


def text_forms(data: bytes) -> Iterable[str]:
    for encoding in ("utf-8", "utf-16le", "utf-16be", "latin-1"):
        try:
            yield data.decode(encoding)
        except UnicodeDecodeError:
            continue


def normalized_markup(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", value))


def scan_pdf(data: bytes, source: str) -> Iterable[tuple[str, str]]:
    reader = PdfReader(io.BytesIO(data), strict=False)
    for page_number, page in enumerate(reader.pages, start=1):
        value = page.extract_text() or ""
        if value:
            yield f"{source}:page-{page_number}", value


def scan_eml(data: bytes, source: str, depth: int) -> Iterable[tuple[str, str]]:
    message = BytesParser(policy=policy.default).parsebytes(data)
    yield f"{source}:headers", "\n".join(f"{key}: {value}" for key, value in message.items())
    for index, part in enumerate(message.walk()):
        if part.is_multipart():
            continue
        payload = part.get_payload(decode=True) or b""
        filename = part.get_filename() or f"part-{index}"
        content_type = part.get_content_type()
        part_source = f"{source}:{filename}"
        if content_type.startswith("text/"):
            charset = part.get_content_charset() or "utf-8"
            value = payload.decode(charset, errors="replace")
            yield part_source, normalized_markup(value)
        elif payload and depth < MAX_DEPTH:
            yield from scan_bytes(payload, filename, part_source, depth + 1)


def scan_msg(data: bytes, source: str, depth: int) -> Iterable[tuple[str, str]]:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".msg", delete=False) as temporary:
            temporary.write(data)
            temporary_path = Path(temporary.name)
        with extract_msg.openMsg(str(temporary_path), delayAttachments=False) as message:
            values = [
                getattr(message, "subject", "") or "",
                getattr(message, "sender", "") or "",
                getattr(message, "to", "") or "",
                getattr(message, "cc", "") or "",
                getattr(message, "header", "") or "",
                getattr(message, "body", "") or "",
                getattr(message, "htmlBody", b"") or b"",
            ]
            text_values = []
            for value in values:
                if isinstance(value, bytes):
                    text_values.extend(text_forms(value))
                else:
                    text_values.append(str(value))
            yield f"{source}:message", normalized_markup("\n".join(text_values))
            if depth >= MAX_DEPTH:
                return
            for index, attachment in enumerate(message.attachments):
                filename = (
                    getattr(attachment, "longFilename", None)
                    or getattr(attachment, "shortFilename", None)
                    or f"attachment-{index}"
                )
                payload = getattr(attachment, "data", b"")
                if isinstance(payload, bytes) and payload:
                    yield from scan_bytes(payload, filename, f"{source}:{filename}", depth + 1)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def scan_zip(data: bytes, source: str, depth: int, office_only: bool) -> Iterable[tuple[str, str]]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in archive.infolist():
            if info.is_dir() or info.file_size > MAX_ENTRY_BYTES:
                continue
            name = info.filename
            extension = Path(name).suffix.casefold()
            if office_only and extension not in TEXT_EXTENSIONS and extension not in {".rels"}:
                continue
            payload = archive.read(info)
            entry_source = f"{source}:{name}"
            if extension in TEXT_EXTENSIONS or extension == ".rels":
                yield entry_source, normalized_markup(next(iter(text_forms(payload)), ""))
            elif depth < MAX_DEPTH:
                yield from scan_bytes(payload, name, entry_source, depth + 1)


def scan_bytes(data: bytes, filename: str, source: str, depth: int = 0) -> Iterable[tuple[str, str]]:
    extension = Path(filename).suffix.casefold()
    if extension in IMAGE_EXTENSIONS:
        return
    if extension == ".pdf":
        yield from scan_pdf(data, source)
    elif extension == ".eml":
        yield from scan_eml(data, source, depth)
    elif extension == ".msg":
        yield from scan_msg(data, source, depth)
    elif extension in OFFICE_EXTENSIONS:
        yield from scan_zip(data, source, depth, office_only=True)
    elif extension == ".zip":
        yield from scan_zip(data, source, depth, office_only=False)
    else:
        for index, value in enumerate(text_forms(data)):
            yield f"{source}:binary-text-{index}", value


def main() -> int:
    findings: list[tuple[str, str, list[str]]] = []
    errors: list[tuple[str, str]] = []
    files = repository_files()
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        try:
            for source, value in scan_bytes(path.read_bytes(), path.name, relative):
                identifiers = matches(value)
                if identifiers:
                    findings.append((relative, source, identifiers))
        except Exception as error:  # noqa: BLE001 - every unreadable artifact is a gate failure
            errors.append((relative, f"{type(error).__name__}: {error}"))

    print(f"Decoded binary-content check: {len(files)} file(s) scanned.")
    for relative, source, identifiers in findings:
        print(f"- {relative} [{source}; {','.join(identifiers)}]", file=sys.stderr)
    for relative, error in errors:
        print(f"- scan error: {relative} ({error})", file=sys.stderr)
    if findings:
        print(f"FAILED: {len(findings)} configured-signature location(s).", file=sys.stderr)
        return 1
    if errors:
        print(f"FAILED: {len(errors)} artifact(s) could not be decoded.", file=sys.stderr)
        return 2
    print("No configured signatures found in decoded content.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
