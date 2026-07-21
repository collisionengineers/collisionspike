"""PLAN-014 Slice 0 (D4) — attachment_content_typings parity + new-input behaviour.

`attachment_content_typings` is a NEW optional param on `classify_email()`: a sparse list
of `{filename, doc_type}` (doc_type in instruction|report|junk|unknown) from the parser's
already-built content-based attachment detector (detection/attachment_typing.py). Absent
or empty must be byte-for-bit identical to today's output (proven below against real
existing-suite scenarios, not synthetic ones). Content overrides filename PER FILE (the
automated-review per-file-precedence fix, not a coarse aggregate): a content-detected
`report` promotes the report-attachment signal (has_report_attachment) UNLESS a sibling
attachment is content-typed `instruction`, in which case the instruction wins; a
content-detected `instruction` promotes an instruction-doc (has_instruction_doc) even
under a generic filename; and only a content-detected `junk` (not `unknown`, the
detector's safe abstain default), with no `report`/`instruction` sibling, withdraws an
instruction-doc promotion.
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


# --------------------------------------------------------------------------- #
# New behaviour (per-file reconciliation) — a sibling `report` must NOT suppress  #
# when another attachment is content-typed `instruction`.                         #
# --------------------------------------------------------------------------- #
def test_content_report_sibling_does_not_suppress_when_instruction_also_present():
    """PLAN-014 D4 per-file precedence (automated-review fix): content overrides
    filename PER FILE, not as a coarse aggregate. A `report` verdict on ONE attachment
    used to unconditionally set has_report_attachment and abstain the whole email to
    `other` -- even when a SECOND attachment was content-typed `instruction`. The fix
    makes `report` count only when no sibling is `instruction`; the instruction then
    promotes normally. (Contrast test_content_typed_report_with_generic_filename_
    suppresses_new_work_promotion, where `report` is the ONLY content verdict.)"""
    kwargs = dict(
        subject="Documents enclosed",
        body="Please see the attached document.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["scan0091.pdf", "scan0092.pdf"],
        has_attachments=True,
    )
    # A lone report verdict still suppresses (abstains to other), unchanged.
    report_only = classify_email(
        **kwargs,
        attachment_content_typings=[{"filename": "scan0091.pdf", "doc_type": "report"}],
    )
    assert report_only["category"] == "other"
    assert "report_attachment" in report_only["signals"]

    # With an instruction sibling, the instruction wins per file: report no longer
    # suppresses, and the email promotes as a provider instruction.
    report_plus_instruction = classify_email(
        **kwargs,
        attachment_content_typings=[
            {"filename": "scan0091.pdf", "doc_type": "report"},
            {"filename": "scan0092.pdf", "doc_type": "instruction"},
        ],
    )
    assert report_plus_instruction["category"] == "receiving_work"
    assert report_plus_instruction["subtype"] == "existing_provider_instruction"
    assert "report_attachment" not in report_plus_instruction["signals"]
    assert (
        "attachment_content_typings:instruction,report"
        in report_plus_instruction["signals"]
    )


# --------------------------------------------------------------------------- #
# New behaviour (per-file reconciliation) — a content `instruction` promotes      #
# even when the FILENAME/extension kind gives no instruction doc.                #
# --------------------------------------------------------------------------- #
def test_content_instruction_promotes_even_with_non_instruction_filename_kind():
    """PLAN-014 D4 per-file precedence (automated-review fix): a photos-only PDF whose
    extension-derived kind is not `instruction` (here `image`) but whose CONTENT the
    parser typed `instruction` must still promote -- content feeds has_instruction_doc
    directly. Without content typing the email abstains to `other`; with it, it promotes
    as a provider instruction."""
    kwargs = dict(
        subject="Documents enclosed",
        body="Please see the attached document.",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["scan0091.pdf"],
        has_attachments=True,
    )
    without_typing = classify_email(**kwargs)
    assert without_typing["category"] == "other"

    with_typing = classify_email(
        **kwargs,
        attachment_content_typings=[{"filename": "scan0091.pdf", "doc_type": "instruction"}],
    )
    assert with_typing["category"] == "receiving_work"
    assert with_typing["subtype"] == "existing_provider_instruction"
    assert "attachment_content_typings:instruction" in with_typing["signals"]
