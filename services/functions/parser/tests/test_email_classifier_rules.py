"""Classification rules for enquiries, instructions, attachments, and queries."""


import email
import email.policy
import json
import os
import sys
from pathlib import Path

import azure.functions as func
import pytest

import function_app
from cedocumentmapper_v2.rules.email_classifier import (
    CONTRACT_VERSION,
    classify_email,
    _job_reference,
    _has_report_attachment,
    _has_new_image_evidence,
    _delivered_images_only,
    _is_reply,
    _is_bare_acknowledgement,
    _sender_written_text,
)

# --------------------------------------------------------------------------- #
# Pure-function unit checks (independent of the corpus)                       #
# --------------------------------------------------------------------------- #
def test_taxonomy_v4_keeps_the_positional_call_contract():
    result = classify_email(
        "New instruction",
        "Please inspect the vehicle and prepare a report.",
        "ops@provider.example",
        "provider.example",
        "one",
        ["instruction"],
        True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"


def test_website_general_enquiry_outranks_case_update_tokens():
    result = classify_email(
        subject="New General Enquiry - Rachael Yeardley",
        body=(
            "General Enquiry from the Website\n"
            "Name: Rachael Yeardley\n"
            "Message: Please help with vehicle AB12 CDE and reference QDOS26079.\n"
            "Submitted via the Collision Engineers website contact form."
        ),
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
        authentication_results=(
            "spf=pass; dkim=pass header.d=noreply.collisionengineers.co.uk; "
            "dmarc=pass header.from=noreply.collisionengineers.co.uk; compauth=pass"
        ),
        provider_match_state="none",
        attachment_kinds=["image"],
        has_attachments=True,
        open_case_ref_match="one",
    )
    assert result["category"] == "website_enquiry"
    assert result["subtype"] == "website_general_enquiry"
    assert result["taxonomy_version"] == 4
    assert "rule:website_general_enquiry" in result["signals"]
    assert "website_form_authenticated" in result["signals"]
    assert "website_form_markers:subject,heading,footer" in result["signals"]


def test_website_enquiry_requires_exact_sender_and_two_form_markers():
    common = {
        "subject": "New General Enquiry - Example",
        "body": (
            "General Enquiry from the Website\n"
            "Submitted via the Collision Engineers website contact form."
        ),
        "provider_match_state": "none",
        "authentication_results": (
            "dmarc=pass header.from=noreply.collisionengineers.co.uk; compauth=pass"
        ),
    }
    wrong_sender = classify_email(
        **common,
        from_address="visitor@example.com",
        sender_domain="example.com",
    )
    one_marker = classify_email(
        subject="New General Enquiry - Example",
        body="Hello, I would like some help.",
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
        provider_match_state="none",
        authentication_results=(
            "dmarc=pass header.from=noreply.collisionengineers.co.uk; compauth=pass"
        ),
    )
    display_name_like = classify_email(
        **common,
        from_address="collision-engineers@example.com",
        sender_domain="example.com",
    )
    trusted_address_in_display_name = classify_email(
        **common,
        from_address='"mail@noreply.collisionengineers.co.uk" <visitor@example.com>',
        sender_domain="example.com",
    )
    unauthenticated_exact_sender = classify_email(
        subject="New General Enquiry - Example",
        body=(
            "General Enquiry from the Website\n"
            "Submitted via the Collision Engineers website contact form."
        ),
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
        authentication_results="dmarc=fail; compauth=fail",
        provider_match_state="none",
    )
    missing_authentication = classify_email(
        **{key: value for key, value in common.items() if key != "authentication_results"},
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
    )
    partial_authentication = classify_email(
        **{key: value for key, value in common.items() if key != "authentication_results"},
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
        authentication_results="dmarc=pass header.from=noreply.collisionengineers.co.uk",
    )
    unbound_authentication = classify_email(
        **{key: value for key, value in common.items() if key != "authentication_results"},
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
        authentication_results=(
            "dmarc=pass header.from=example.com; header.from=noreply.collisionengineers.co.uk; "
            "compauth=pass"
        ),
    )
    for result in (
        wrong_sender,
        one_marker,
        display_name_like,
        trusted_address_in_display_name,
        unauthenticated_exact_sender,
        missing_authentication,
        partial_authentication,
        unbound_authentication,
    ):
        assert result["category"] != "website_enquiry"


def test_website_enquiry_body_markers_work_without_subject_marker_and_beat_cancellation():
    result = classify_email(
        subject="A question",
        body=(
            "General Enquiry from the Website\n"
            "Please cancel my claim for AB12 CDE.\n"
            "Submitted via the Collision Engineers website contact form."
        ),
        from_address="mail@noreply.collisionengineers.co.uk",
        sender_domain="noreply.collisionengineers.co.uk",
        authentication_results=(
            "dmarc=pass header.from=noreply.collisionengineers.co.uk; compauth=pass"
        ),
        provider_match_state="none",
    )
    assert result["category"] == "website_enquiry"
    assert "website_form_markers:heading,footer" in result["signals"]


def test_instruction_doc_with_audit_phrases_is_audit_subtype():
    result = classify_email(
        subject="Inspection Request to Engineers 2",
        body="An audit report is required of the original engineer.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_audit"
    assert result["confidence"] >= 0.9


def test_instruction_doc_unknown_domain_is_new_client():
    result = classify_email(
        subject="New matter",
        body="Please inspect.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "new_client_work"


def test_body_only_instruction_needs_two_phrases_and_a_reference():
    """A single stray work phrase must NOT promote a no-attachment email to work
    (abstain bias). Two phrases + a Case/PO or VRM does."""
    weak = classify_email(
        subject="hello",
        body="Please inspect.",  # one phrase, no reference
        provider_match_state="one",
        has_attachments=False,
    )
    assert weak["category"] == "other"

    strong = classify_email(
        subject="New instruction CCPY26050",
        body="We instruct you to carry out an inspection. Please inspect AB12 CDE.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert strong["category"] == "receiving_work"
    assert strong["body_caseref"] == "CCPY26050"


def test_auto_reply_with_no_attachment_abstains_even_with_work_language():
    """An out-of-office reply that quotes work language + a registration must still
    abstain to other when there is no attachment."""
    result = classify_email(
        subject="Automatic reply",
        body="I am out of the office. Original message: please inspect and prepare a report for AB12 CDE. New instruction CCPY26050.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "other"


def test_auto_reply_with_image_but_no_instruction_doc_still_abstains():
    """Regression (ADR-0015): an out-of-office / bounce that CARRIES an image (a
    signature logo, a returned-message screenshot, the original photo bounced back)
    — but NO instruction doc — from a known provider must STILL abstain to other.
    An auto-reply + image must not slip through to Rule 2 and read as work. The
    abstain is preserved for the image-only case; only an instruction DOC overrides
    it (see test_instruction_doc_overrides_auto_reply_abstain)."""
    ooo = classify_email(
        subject="Automatic reply: Out of office",
        body="I am out of the office and away from my desk until Monday.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert ooo["category"] == "other"
    assert ooo["subtype"] == "other"
    assert ooo["signals"][-1] == "rule:auto_reply_marker"

    bounce = classify_email(
        subject="Undeliverable: Inspection request",
        body="Delivery has failed. The message could not be delivered and was returned to sender.",
        provider_match_state="none",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert bounce["category"] == "other"
    assert bounce["signals"][-1] == "rule:auto_reply_marker"


def test_instruction_doc_overrides_auto_reply_abstain():
    """Regression (PR #24 review finding #3): the auto-reply/bounce abstain (Rule 0)
    must NOT swallow a legitimate automated provider instruction. A real instruction
    — instruction PDF attached, with a polite "please do not reply" automated footer
    — is the module's strongest positive signal; pre-fix Rule 0 fired on the footer
    marker above Rule 1 and forced it to ``other``, so the Case was never created.
    An attached instruction doc now overrides the abstain and Rule 1 wins."""
    result = classify_email(
        subject="New instruction - please inspect",
        body=(
            "Please inspect the vehicle and prepare a report.\n\n"
            "--\nThis is an automated notification. Please do not reply to this address."
        ),
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"
    assert result["signals"][-1] == "rule:instruction_doc_existing_provider"

    # The same override holds for an audit instruction whose footer says "do not reply".
    audit = classify_email(
        subject="Inspection Request to Engineers 2",
        body=(
            "An audit report is required of the original engineer's findings.\n\n"
            "Automatic message — do not reply."
        ),
        provider_match_state="one",
        attachment_kinds=["instruction", "image"],
        has_attachments=True,
    )
    assert audit["category"] == "receiving_work"
    assert audit["subtype"] == "existing_provider_audit"


def test_query_with_image_from_known_provider_is_query_not_work():
    """Regression (ADR-0015): a query email that merely re-attaches the original
    photo — query phrasing, an image, a known provider, but NO work phrase and no
    instruction doc — must classify as a query, NOT receiving_work. Pre-fix it hit
    Rule 2 (images_with_work_signal) on the provider match alone, which would
    create or touch a work Case. The reference makes it query_existing_work."""
    result = classify_email(
        subject="FW: claim CCPY26050 - any update?",
        body="Just chasing the report. Could you confirm where this is up to? I have re-attached the original vehicle photo.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert result["body_caseref"] == "CCPY26050"
    # F6: the image carried a corroborating Case/PO and was suppressed by the
    # query-guard (not for lack of corroboration), so it must NOT carry the
    # contradictory ``uncorroborated_provider_image`` flag the LLM pass keys on.
    assert "uncorroborated_provider_image" not in result["signals"]


def test_query_with_image_no_reference_is_query_existing_work():
    """The same collision without a Case/PO or VRM: query phrasing + image +
    provider, no work phrase. Falls through Rule 2 to the keyword-only query rule
    (query_existing_work because the provider is known)."""
    result = classify_email(
        subject="FW: claim",
        body="Just checking the status of this. Could you confirm?",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


def test_images_with_work_phrase_still_receiving_work():
    """Guard against over-correction: an image + a genuine work phrase must STILL
    be receiving_work even when a query phrase is also present (work wins)."""
    result = classify_email(
        subject="New instruction",
        body="Please inspect the vehicle and prepare a report. Could you confirm receipt?",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"
    assert result["signals"][-1] == "rule:images_with_work_signal"


def test_image_with_provider_only_abstains_to_other():
    """Over-promotion fix (2026-06-29): an image + a known provider with NO work
    phrase, NO Case/PO, NO VRM and NO audit signal must NOT be promoted to work on
    the provider-domain match alone — a forwarded chain, a signature logo, or a
    bounced-back photo from a provider address would all match the domain. Pre-fix
    this hit Rule 2 (``provider_known`` was a trigger) and minted a blank Case;
    the provider match now only selects the subtype once another signal
    corroborates, so a bare provider image abstains to ``other``."""
    result = classify_email(
        subject="Photos for you",
        body="Here are the photos as discussed.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "other"
    assert result["subtype"] == "other"
    assert "uncorroborated_provider_image" in result["signals"]
    assert result["signals"][-1] == "rule:abstain_to_other"


def test_instruction_doc_without_corroboration_abstains_to_other():
    """Over-promotion fix (2026-06-29): a bare attachment whose kind was derived
    from the file extension alone (.pdf/.doc/.docx -> "instruction") — a spam
    flyer, invoice, statement or newsletter — with NO provider match, NO work
    phrase and NO Case/PO or VRM must NOT mint a Case. Pre-fix Rule 1 promoted any
    instruction-kind attachment to new_client_work unconditionally; the new-client
    arm now requires corroboration, so an uncorroborated doc abstains to other and
    is flagged for the deferred LLM pass."""
    result = classify_email(
        subject="Spring sale - 20% off all services",
        body="See the attached flyer for our latest offers. Visit our website today.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "other"
    assert result["subtype"] == "other"
    assert "attachment_kinds:instruction" in result["signals"]
    assert "uncorroborated_instruction_doc" in result["signals"]
    assert result["signals"][-1] == "rule:abstain_to_other"


def test_instruction_doc_with_caseref_promotes():
    """An instruction-kind attachment from an UNKNOWN provider is still promoted
    to new_client_work when a body Case/PO corroborates it — the doc is no longer
    promoted on the extension alone, but a real reference is enough."""
    result = classify_email(
        subject="Documents enclosed - CCPY26050",
        body="Please see the attached paperwork in relation to CCPY26050.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "new_client_work"
    assert result["body_caseref"] == "CCPY26050"
    assert result["signals"][-1] == "rule:instruction_doc_new_client"


def test_image_with_provider_and_caseref_promotes():
    """An image from a known provider IS promoted when a body Case/PO corroborates
    it (no work phrase, no query phrasing) — the provider match selects the
    existing-provider subtype while the Case/PO is the corroborating signal."""
    result = classify_email(
        subject="Photos - CCPY26050",
        body="Vehicle photographs attached for CCPY26050.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"
    assert result["body_caseref"] == "CCPY26050"
    assert result["signals"][-1] == "rule:images_with_work_signal"


def test_image_with_audit_signal_from_known_provider_is_audit_subtype():
    """F3: an audit-phrase image from a KNOWN provider promotes to the audit subtype
    (the only path that may emit existing_provider_audit). A re-inspection arriving as
    photos from a matched provider keeps the 'A.'-prefixed audit case-type."""
    result = classify_email(
        subject="Re-inspection photos",
        body="An audit report is required of the original engineer's findings.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_audit"
    assert result["signals"][-1] == "rule:images_with_work_signal"


def test_image_with_audit_signal_unknown_provider_abstains():
    """F3: an audit-phrase image from an UNKNOWN provider abstains to other — there is
    no new-client-audit subtype, and an audit signal alone (no provider, no work phrase,
    no Case/PO) is too weak to promote a bare image (audit subtype needs a known
    provider). Pre-remediation this mislabelled it new_client_work."""
    result = classify_email(
        subject="Re-inspection photos",
        body="An audit report is required of the original engineer's findings.",
        provider_match_state="none",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "other"
    assert result["subtype"] == "other"


def test_image_with_provider_and_postcode_only_abstains():
    """F1 (headline regression): a bare image from a known provider whose body carries
    only a routine token (a postcode) must NOT promote — it abstains to other and flags
    uncorroborated_provider_image.

    collisionspike #7 (2026-06-29): the body_vrm sniff now uses a canonical ruleset
    that EXCLUDES postcode-shaped tokens, so the postcode outward code 'CV1' (which the
    loose engine VRM_RE over-matched) is no longer surfaced as a body_vrm at all — the
    inbox VRM chip stays clean. (Promotion was already gated; this also stops the chip
    from showing the postcode.)"""
    result = classify_email(
        subject="FW: pictures",
        body="Here are the photos. Our office: Coventry CV1 2AB. Tel 024 7600 1234.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "other"
    assert result["subtype"] == "other"
    assert "uncorroborated_provider_image" in result["signals"]
    assert result["body_vrm"] == ""  # #7: postcode 'CV1' no longer mis-surfaced as a VRM


def test_instruction_doc_with_vrm_token_only_unknown_provider_abstains():
    """F1: an instruction-class attachment from an unknown provider with no work phrase
    / Case/PO must NOT mint a Case — a body VRM does not corroborate. Abstains to other.

    F162 (2026-06-29): natural-language / model text that the well-formed VRM tier
    mis-read as a plate ("Model X5 now …" -> "X5 NOW", suffix is an English word) is no
    longer surfaced as a body_vrm at all when no VRM context word sits nearby, so the
    inbox chip stays clean. A GENUINE VRM-shaped token is still surfaced but likewise
    does not corroborate the doc."""
    # F162: the model-text token is suppressed (its trigram "NOW" is a stop-word and
    # there is no VRM context word beside it) — not surfaced, and it never promoted.
    model_text = classify_email(
        subject="Special offer",
        body="Model X5 now 20% off — best deal this year.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert model_text["category"] == "other"
    assert model_text["subtype"] == "other"
    assert "uncorroborated_instruction_doc" in model_text["signals"]
    assert model_text["body_vrm"] == ""  # F162: "X5 NOW" no longer mis-surfaced

    # A genuine VRM-shaped token IS surfaced, but a body VRM still does not corroborate
    # an instruction doc from an unknown provider — it abstains all the same.
    real_vrm = classify_email(
        subject="Documents enclosed",
        body="Please see the attached re AB12 XYZ.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert real_vrm["category"] == "other"
    assert real_vrm["subtype"] == "other"
    assert "uncorroborated_instruction_doc" in real_vrm["signals"]
    assert real_vrm["body_vrm"] == "AB12XYZ"  # VRM-shaped token found, but did NOT promote


def test_instruction_doc_audit_unknown_provider_is_not_existing_provider_audit():
    """F2: an audit-phrase instruction doc from an UNKNOWN provider must never be
    labelled existing_provider_audit (that would attribute an 'A.'-prefixed Case/PO to a
    non-existent provider). With a corroborating work phrase it promotes as new_client_work;
    with audit phrases ALONE it abstains to other."""
    corroborated = classify_email(
        subject="New matter",
        body="An audit report is required of the original engineer. Please inspect the vehicle.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert corroborated["category"] == "receiving_work"
    assert corroborated["subtype"] == "new_client_work"

    audit_alone = classify_email(
        subject="FW: report",
        body="An audit report is required of the original engineer.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert audit_alone["category"] == "other"
    assert "uncorroborated_instruction_doc" in audit_alone["signals"]


def test_instruction_doc_query_with_caseref_falls_through_to_query():
    """F4: a chased query that re-attaches the ORIGINAL instruction doc (query phrasing,
    a Case/PO, no work phrase) must land query — NOT receiving_work — even from a known
    provider. Rule 1 now has Rule 2's query-guard, so it suppresses and falls through to
    the query rules; no contradictory uncorroborated flag (the Case/PO corroborates)."""
    result = classify_email(
        subject="FW: CCPY26050",
        body="Any update on CCPY26050? Could you confirm where this is up to?",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert result["body_caseref"] == "CCPY26050"
    assert "uncorroborated_instruction_doc" not in result["signals"]


def test_uncorroborated_instruction_doc_with_query_falls_through_to_query():
    """Corroboration fix (Rule 1 fall-through): an uncorroborated instruction doc
    (no provider, no work phrase, no Case/PO or VRM) does NOT mint a Case — it
    flags `uncorroborated_instruction_doc` and falls through. When the email is
    ALSO phrased as a query, it correctly lands `query` (Rule 5), not `other`."""
    result = classify_email(
        subject="Quick question",
        body="Could you confirm your availability for next week?",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_new_enquiry"  # provider none
    assert "uncorroborated_instruction_doc" in result["signals"]
    assert result["signals"][-1] == "rule:query_keyword_only"


def test_query_with_reference_is_query_existing_work():
    result = classify_email(
        subject="Chasing report",
        body="Where is my report for AB12 CDE? Any update?",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert result["body_vrm"] == "AB12CDE"


def test_query_keyword_only_unknown_provider_is_new_enquiry():
    result = classify_email(
        subject="Quote",
        body="How much would you charge to inspect a write-off?",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_new_enquiry"


def test_empty_email_abstains_to_other():
    result = classify_email()
    assert result["category"] == "other"
    assert result["subtype"] == "other"
    assert result["signals"][-1] == "rule:abstain_to_other"
