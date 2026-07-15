"""Pure evidence-kind classifier for Box FILE.UPLOADED rows (TKT-133).

The box-webhook receiver previously hard-coded ``evidenceClass='image'`` for
EVERY upload — PDFs, ``.doc`` instructions, ``.eml`` messages and videos landed
as image-kind and leaked into the photo orderer / EVA-export zip (TKT-124 root
cause). The API-side TKT-124 writer guard re-derives an 'image'-claimed row
server-side and STAYS as belt-and-braces; THIS makes the client honest at
source.

Mirrors the api's shared domain mapping EXACTLY (packages/domain/src/domain/
classification.ts ``classifyAttachment`` + the TKT-124 re-kind delta
database/migrations/2026-07-09-tkt124-rekind-box-evidence.sql):
extension PRIMARY, MIME fallback only when the extension is absent/unknown.

    .jpg / .jpeg / .png                  -> image
    .pdf / .docx / .doc                  -> instruction
    .eml                                 -> email
    unknown/absent ext + image/*         -> image   (wildcard — an honest MIME
                                                     beats a missing table entry,
                                                     e.g. .tiff/.heic scans)
    unknown/absent ext + pdf/word MIME   -> instruction
    unknown/absent ext + message/rfc822  -> email
    everything else                      -> other

The ``engineer_report`` class is NEVER produced here (same doctrine as the
domain module): it is the TKT-095 classifier override in the receiver, which
wins over this mapping.

PURE + DETERMINISTIC + import-light. No I/O, no live calls.
"""

from __future__ import annotations

# Lower-cased file extension (no dot) -> evidence class (primary signal).
_EXTENSION_TABLE: dict[str, str] = {
    "jpg": "image",
    "jpeg": "image",
    "png": "image",
    "pdf": "instruction",
    "docx": "instruction",
    "doc": "instruction",
    "eml": "email",
}

# Lower-cased MIME base type -> evidence class (fallback signal; ``image/*`` is
# handled as a wildcard before this table).
_MIME_TABLE: dict[str, str] = {
    "application/pdf": "instruction",
    "application/msword": "instruction",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "instruction",
    "message/rfc822": "email",
}


def extension_of(filename: str) -> str:
    """Lower-cased extension (without the dot), or '' when the filename has none
    (no dot, trailing dot, or a leading-dot dotfile). Mirrors the domain module's
    ``extensionOf``."""
    name = (filename or "").strip()
    dot = name.rfind(".")
    if dot <= 0 or dot == len(name) - 1:
        return ""
    return name[dot + 1 :].lower()


def _normalise_mime(content_type: str | None) -> str:
    """Strip parameters (``; charset=...``) and lower-case the base type."""
    if not content_type:
        return ""
    base = content_type.split(";", 1)[0]
    return base.strip().lower()


def classify_evidence_kind(filename: str, content_type: str | None = None) -> str:
    """Classify one uploaded file. Extension is authoritative; MIME only resolves
    the unknown-extension case; anything unrecognised by both is ``'other'``
    (still persisted — never thrown away here)."""
    by_ext = _EXTENSION_TABLE.get(extension_of(filename))
    if by_ext:
        return by_ext
    mime = _normalise_mime(content_type)
    if mime.startswith("image/"):
        return "image"
    return _MIME_TABLE.get(mime, "other")
