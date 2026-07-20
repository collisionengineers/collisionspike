"""PLAN-014 D4 / TKT-288 overlap tripwires — NOT bug fixes.

TKT-288 (`docs/tickets/backlog/TKT-288-engine-classifier-precedence-findings/`, currently
only on the unmerged `engine/cedocumentmapper-merge` branch) ports 16 known, unfixed
precedence/ordering findings from the sibling repo's issue #6. Four of them (#5, #9, #12,
#13 in that issue's numbering) sit in or directly beside the exact `has_instruction_doc` /
`has_report_attachment` / `suppress_as_query` dispatch block D4 (attachment_content_typings,
this same PR) extends.

These tests deliberately PIN TODAY'S KNOWN-BUGGY OUTPUT — they are a tripwire, not a spec.
D4 does not attempt to fix any of these; that is out of scope here (no scope creep). When
TKT-288 is eventually picked up, whichever of these assertions it changes is EXPECTED to
change — that is the point: a visible, deliberate diff instead of a silent double-fix or a
silent regression against an assumption D4 made about today's behaviour.
"""

from cedocumentmapper_v2.rules.email_classifier import classify_email


def test_tkt288_finding5_receipt_confirmation_cover_note_currently_suppressed():
    """TKT-288 #5 — 'Don't suppress provider instructions on receipt-confirmation cover
    notes.' Today: a receipt-confirmation phrase ('please confirm receipt') on an email
    that DOES carry a real instruction attachment from a known provider is suppressed to
    a query, rather than promoting as work."""
    result = classify_email(
        subject="Instruction enclosed",
        body="Please confirm safe receipt of the attached instruction.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert "rule:query_keyword_only" in result["signals"]


def test_tkt288_finding9_new_work_reply_currently_reads_as_existing_query():
    """TKT-288 #9 — 'Don't classify new-work replies as existing queries.' Today: a reply
    with exactly one new work keyword + a body Case/PO (but no attachment) misses the
    fresh-work rule and reads as an existing-work query instead."""
    result = classify_email(
        subject="Re: your claim",
        body="Please also inspect the second vehicle for case CCPY26050.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert "rule:reply_with_reference" in result["signals"]


def test_tkt288_finding12_billing_only_mail_currently_promotes_via_instruction_kind():
    """TKT-288 #12 — 'Suppress billing requests before doc promotion.' Today: a
    billing-only mail (invoice/payment language, no work language) with any
    instruction-typed attachment promotes to existing_provider_instruction BEFORE any
    billing-suppression rule runs — this is the exact `has_instruction_doc`/
    `suppress_as_query` block D4 (this PR) extends, so the overlap is direct."""
    result = classify_email(
        subject="Invoice enclosed",
        body="Please find attached our invoice for payment.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"
    assert "rule:instruction_doc_existing_provider" in result["signals"]


def test_tkt288_finding13_ambiguous_provider_currently_treated_as_new_client():
    """TKT-288 #13 — 'Don't route ambiguous providers as new clients.' Today:
    provider_match_state == 'ambiguous' is treated exactly like 'none' (skips
    disambiguation), so an ambiguous-provider instruction promotes as a brand new client
    instead of flagging for disambiguation."""
    result = classify_email(
        subject="New matter",
        body="Please inspect.",
        provider_match_state="ambiguous",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "new_client_work"
    assert "rule:instruction_doc_new_client" in result["signals"]
