"""One-off generator for SYNTHETIC_RETRO_MSG_01.msg — a minimal, fully SYNTHETIC
Outlook ``.msg`` fixture (MS-OXMSG property streams inside a genuine OLE compound
document) for the /explode-eml .msg branch tests.

``extract_msg`` can only READ .msg files, so the fixture is authored here with
pywin32 COM structured storage (``pythoncom.StgCreateDocfile``), which writes
real CFB containers; the MSG property streams are hand-assembled per MS-OXMSG
(top-level 32-byte properties header, 16-byte property entries, ``__substg1.0_``
value streams, one recipient storage, one ATTACH_BY_VALUE attachment storage and
an empty ``__nameid_version1.0`` skeleton).

Windows-only (pywin32); run once and commit the binary output:

    python tests/fixtures/make_synthetic_msg.py tests/fixtures/SYNTHETIC_RETRO_MSG_01.msg

Synthetic data ONLY — no real case material:
  From:    test@example.com
  To:      engineers@collisionengineers.co.uk
  Subject: Synthetic retro msg fixture
  Body:    "Synthetic retro msg fixture body. VRM AB12 CDE. Ref 999999."
  Attach:  note.txt (synthetic text bytes)
"""

from __future__ import annotations

import struct
import sys
from datetime import datetime, timezone

import pythoncom
import pywintypes
from win32com import storagecon

STGM_W = (
    storagecon.STGM_CREATE
    | storagecon.STGM_READWRITE
    | storagecon.STGM_SHARE_EXCLUSIVE
    | storagecon.STGM_DIRECT
)

PT_UNICODE = 0x001F
PT_LONG = 0x0003
PT_BINARY = 0x0102
PT_SYSTIME = 0x0040
FLAGS = 0x00000006  # PROPATTR_READABLE | PROPATTR_WRITABLE

# Outlook message CLSID for the root storage.
MSG_CLSID = "{00020D0B-0000-0000-C000-000000000046}"


def _tag(prop_id: int, prop_type: int) -> int:
    return (prop_id << 16) | prop_type


def _entry_fixed(prop_id: int, prop_type: int, value_bytes: bytes) -> bytes:
    assert len(value_bytes) == 8
    return struct.pack("<II", _tag(prop_id, prop_type), FLAGS) + value_bytes


def _entry_long(prop_id: int, value: int) -> bytes:
    return _entry_fixed(prop_id, PT_LONG, struct.pack("<Ii", value, 0)[:8])


def _entry_systime(prop_id: int, dt: datetime) -> bytes:
    epoch = datetime(1601, 1, 1, tzinfo=timezone.utc)
    filetime = int((dt - epoch).total_seconds() * 10_000_000)
    return _entry_fixed(prop_id, PT_SYSTIME, struct.pack("<Q", filetime))


def _entry_var(prop_id: int, prop_type: int, stream_len: int) -> bytes:
    # Variable-length entry: size field is stream length (+2 for PT_UNICODE's
    # implied null terminator, +0 for PT_BINARY) per MS-OXMSG 2.4.2.2.
    declared = stream_len + (2 if prop_type == PT_UNICODE else 0)
    return struct.pack("<IIII", _tag(prop_id, prop_type), FLAGS, declared, 0)


def _stream(storage, name: str, data: bytes) -> None:
    stm = storage.CreateStream(name, STGM_W)
    if data:
        stm.Write(data)


def _sub(storage, prop_id: int, prop_type: int, value) -> bytes:
    """Write a ``__substg1.0_`` value stream; return its properties entry."""
    if prop_type == PT_UNICODE:
        data = str(value).encode("utf-16-le")
    else:
        data = bytes(value)
    name = f"__substg1.0_{prop_id:04X}{prop_type:04X}"
    _stream(storage, name, data)
    return _entry_var(prop_id, prop_type, len(data))


def main(out_path: str) -> None:
    root = pythoncom.StgCreateDocfile(out_path, STGM_W)
    root.SetClass(pywintypes.IID(MSG_CLSID))

    headers = (
        "From: test@example.com\r\n"
        "To: engineers@collisionengineers.co.uk\r\n"
        "Subject: Synthetic retro msg fixture\r\n"
        "Date: Mon, 02 Mar 2026 09:15:00 +0000\r\n"
        "Message-ID: <synthetic-retro-msg-fixture@example.com>\r\n"
        "In-Reply-To: <synthetic-parent@example.com>\r\n"
        "References: <synthetic-root@example.com> <synthetic-parent@example.com>\r\n"
    )

    entries: list[bytes] = [
        _entry_long(0x340D, 0x00040000),  # PR_STORE_SUPPORT_MASK: STORE_UNICODE_OK
        _entry_systime(0x0039, datetime(2026, 3, 2, 9, 15, tzinfo=timezone.utc)),
    ]
    for prop_id, value in (
        (0x001A, "IPM.Note"),                                   # message class
        (0x0037, "Synthetic retro msg fixture"),                # subject
        (0x0C1A, "test@example.com"),                           # sender name
        (0x0C1F, "test@example.com"),                           # sender email
        (0x0E04, "engineers@collisionengineers.co.uk"),         # display to
        (0x1000, "Synthetic retro msg fixture body. VRM AB12 CDE. Ref 999999."),
        (0x1035, "<synthetic-retro-msg-fixture@example.com>"),  # internet message id
        (0x1042, "<synthetic-parent@example.com>"),             # in-reply-to id
        (0x007D, headers),                                      # transport headers
    ):
        entries.append(_sub(root, prop_id, PT_UNICODE, value))

    # --- one recipient -------------------------------------------------------
    recip = root.CreateStorage("__recip_version1.0_#00000000", STGM_W, 0, 0)
    r_entries = [_entry_long(0x0C15, 1), _entry_long(0x3000, 0)]  # recipType=TO, rowid
    for prop_id, value in (
        (0x3001, "Collision Engineers"),
        (0x3003, "engineers@collisionengineers.co.uk"),
        (0x39FE, "engineers@collisionengineers.co.uk"),
        (0x3002, "SMTP"),
    ):
        r_entries.append(_sub(recip, prop_id, PT_UNICODE, value))
    _stream(recip, "__properties_version1.0", b"\x00" * 8 + b"".join(r_entries))

    # --- one regular attachment ---------------------------------------------
    att = root.CreateStorage("__attach_version1.0_#00000000", STGM_W, 0, 0)
    a_entries = [_entry_long(0x3705, 1), _entry_long(0x0E21, 0)]  # ATTACH_BY_VALUE, num
    for prop_id, value in (
        (0x3704, "note.txt"),
        (0x3707, "note.txt"),
        (0x370E, "text/plain"),
    ):
        a_entries.append(_sub(att, prop_id, PT_UNICODE, value))
    a_entries.append(_sub(att, 0x3701, PT_BINARY, b"synthetic attachment payload\n"))
    _stream(att, "__properties_version1.0", b"\x00" * 8 + b"".join(a_entries))

    # --- named-properties skeleton (empty but present) ------------------------
    nameid = root.CreateStorage("__nameid_version1.0", STGM_W, 0, 0)
    for name in ("__substg1.0_00020102", "__substg1.0_00030102", "__substg1.0_00040102"):
        _stream(nameid, name, b"")

    # --- top-level properties stream (32-byte header) --------------------------
    header = struct.pack("<8xIIII8x", 1, 1, 1, 1)  # nextRecip, nextAttach, recipCount, attachCount
    _stream(root, "__properties_version1.0", header + b"".join(entries))

    root.Commit(storagecon.STGC_DEFAULT)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main(sys.argv[1])
