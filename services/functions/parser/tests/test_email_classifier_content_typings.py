"""PLAN-014 Slice 0 (D4) — attachment_content_typings parity + new-input behaviour.

`attachment_content_typings` is a NEW optional param on `classify_email()`: a sparse list
of `{filename, doc_type}` (doc_type in instruction|report|junk|unknown) from the parser's
already-built content-based attachment detector (detection/attachment_typing.py). Absent
or empty must be byte-for-bit identical to today's output (proven below against real
existing-suite scenarios, not synthetic ones). A content-detected `report` overrides a
filename-derived `instruction` kind (has_report_attachment); a content-detected
`junk`/`unknown` (with no `report`/`instruction` in the set) withdraws an instruction-doc
promotion (has_instruction_doc).
"""

from cedocumentmapper_v2.rules.email_classifier import classify_email


# --------------------------------------------------------------------------- #
# Parity — absent/None/[] must not change output, across real existing scenarios #
# --------------------------------------------------------------------------- #
def test_parity_omitted_vs_none_vs_empty_list_audit_instruction():
    kwargs = dict(
        subject="Inspection Request to Engineers",
        body="An audit report is required of the original engineer's findings.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    omitted = classify_email(**kwargs)
    with_none = classify_email(**kwargs, attachment_content_typings=None)
    with_empty = classify_email(**kwargs, attachment_content_typings=[])
    assert omitted == with_none == with_empty


def test_parity_omitted_vs_none_vs_empty_list_new_client_work():
    kwargs = dict(
        subject="New matter",
        body="Please inspect.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    omitted = classify_email(**kwargs)
    with_none = classify_email(**kwargs, attachment_content_typings=None)
    with_empty = classify_email(**kwargs, attachment_content_typings=[])
    assert omitted == with_none == with_empty


# --------------------------------------------------------------------------- #
# New behaviour — content `report` overrides a filename that doesn't hint report #
# --------------------------------------------------------------------------- #
def test_content_typed_report_with_generic_filename_suppresses_new_work_promotion():
    """A known provider sends back an engineer's report under a GENERIC filename
    (no 'report' in the name — `_has_report_attachment` misses it by filename alone).
    Extension-derived kind reads as `instruction`, so without content typing this
    wrongly promotes as a NEW instruction (TKT-037/039's exact failure shape). Content
    typing recovers it via the report-suppression branch."""
    kwargs = dict(
        subject="Documents enclosed",
        body="Please see the attached document.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["scan0091.pdf"],
        has_attachments=True,
    )
    without_typing = classify_email(**kwargs)
    assert without_typing["category"] == "receiving_work"
    assert without_typing["subtype"] == "existing_provider_instruction"
    assert "report_attachment" not in without_typing["signals"]

    with_typing = classify_email(
        **kwargs,
        attachment_content_typings=[{"filename": "scan0091.pdf", "doc_type": "report"}],
    )
    assert with_typing["category"] != "receiving_work"
    assert "report_attachment" in with_typing["signals"]
    assert "attachment_content_typings:report" in with_typing["signals"]


# --------------------------------------------------------------------------- #
# New behaviour — content junk/unknown withdraws an instruction-doc promotion  #
# --------------------------------------------------------------------------- #
def test_content_typed_junk_withdraws_instruction_promotion():
    """A filename-derived `instruction` kind (e.g. a mis-typed extension on a scanned
    flyer/blank page) should not promote a Case once content typing says it's junk."""
    kwargs = dict(
        subject="New matter",
        body="Please see attached.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["attachment1.pdf"],
        has_attachments=True,
    )
    without_typing = classify_email(**kwargs)
    assert without_typing["category"] == "receiving_work"
    assert without_typing["subtype"] == "existing_provider_instruction"

    with_typing = classify_email(
        **kwargs,
        attachment_content_typings=[{"filename": "attachment1.pdf", "doc_type": "junk"}],
    )
    assert with_typing["category"] != "receiving_work"
    assert "attachment_content_typings:junk" in with_typing["signals"]


def test_content_typed_unknown_alone_does_not_withdraw_instruction_promotion():
    """PLAN-014 D5 backtest finding: 'unknown' is the detector's own deliberate, safe
    abstain default (it could not confidently type the document either way) -- NOT a
    confident negative signal, so it must not alone withdraw a real instruction
    promotion (a real corpus item, a QDOS lead docx the detector could not classify,
    regressed on this exact point during the backtest). Only 'junk' (the detector's
    high-precision, deliberately-tiny negative bucket) withdraws."""
    kwargs = dict(
        subject="New matter",
        body="Please inspect.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["attachment1.pdf"],
        has_attachments=True,
    )
    without_typing = classify_email(**kwargs)
    with_typing = classify_email(
        **kwargs,
        attachment_content_typings=[{"filename": "attachment1.pdf", "doc_type": "unknown"}],
    )
    assert with_typing["category"] == without_typing["category"] == "receiving_work"


def test_content_typed_instruction_does_not_withdraw_its_own_promotion():
    """A content typing of `instruction` (agreeing with the filename-derived kind) must
    not itself withdraw the promotion — only junk/unknown (with no report/instruction in
    the set) does."""
    kwargs = dict(
        subject="New matter",
        body="Please inspect.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        attachment_filenames=["attachment1.pdf"],
        has_attachments=True,
    )
    without_typing = classify_email(**kwargs)
    with_typing = classify_email(
        **kwargs,
        attachment_content_typings=[{"filename": "attachment1.pdf", "doc_type": "instruction"}],
    )
    assert with_typing["category"] == without_typing["category"] == "receiving_work"
    assert with_typing["subtype"] == without_typing["subtype"] == "new_client_work"
