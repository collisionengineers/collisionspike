"""Offline pytest suite for the deterministic inbound-email classifier (Phase 8).

The classifier (``cedocumentmapper_v2.rules.email_classifier.classify_email``) is
a PURE function — keyword / phrase / regex only, no LLM, no Dataverse, no network
— so it runs in the lean suite with no heavy deps. Coverage:

  * Parametrised over the labelled corpus manifest
    (``test-cases-and-data/triage-corpus/labels.json``): Tier 1 = the 12 existing
    receiving-work case folders relabelled to {category, subtype}; Tier 2 =
    synthetic plain-text ``.eml`` fixtures for the gaps (queries, enquiry,
    body-only instruction, auto-reply, bounce). Each fixture must land on the
    expected {category, subtype}.
  * Abstain-to-other discipline: every ``other`` fixture must carry NO
    receiving-work / query label (zero false positives), mirroring
    ``test_audit_detection``'s no-false-positive guard.
  * The ``POST /classify-email`` route: FUNCTION-auth handler called directly with
    a hand-built HttpRequest — happy path, HTML-strip, and the request-guard /
    error envelope (no network, no ``func start``).
"""

from __future__ import annotations

import email
import email.policy
import json
import os

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

_HERE = os.path.dirname(os.path.abspath(__file__))
# .../collisionspike/functions/parser/tests -> .../collisionspike
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_HERE)))
_CORPUS_DIR = os.path.join(_REPO_ROOT, "test-cases-and-data", "triage-corpus")
_LABELS = os.path.join(_CORPUS_DIR, "labels.json")


def _load_manifest() -> dict:
    with open(_LABELS, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _read_eml(rel_path: str) -> tuple[str, str, str, str, str]:
    """Parse a corpus .eml -> subject, body, sender identity and recipient auth result."""
    path = os.path.join(_CORPUS_DIR, *rel_path.split("/"))
    with open(path, "rb") as fh:
        msg = email.message_from_bytes(fh.read(), policy=email.policy.default)
    subject = msg["subject"] or ""
    from_address = msg["from"] or ""
    sender_domain = from_address.split("@")[-1].strip("> ") if "@" in from_address else ""
    authentication_results = msg["authentication-results"] or ""
    if msg.is_multipart():
        body = "".join(
            part.get_content()
            for part in msg.walk()
            if part.get_content_type() in {"text/plain", "text/html"}
        )
    else:
        body = msg.get_content()
    return subject, body, from_address, sender_domain, authentication_results


# --------------------------------------------------------------------------- #
# Build the parametrised cases from the manifest                              #
# --------------------------------------------------------------------------- #
_MANIFEST = _load_manifest()


def _tier1_cases() -> list:
    cases = []
    for entry in _MANIFEST["tier_1_existing_cases"]:
        cases.append(
            pytest.param(
                entry["request"],
                entry["expected"],
                id=f"tier1-{entry['case']}",
            )
        )
    return cases


def _tier2_cases() -> list:
    cases = []
    for entry in _MANIFEST["tier_2_synthetic"]:
        subject, body, from_address, sender_domain, authentication_results = _read_eml(entry["eml"])
        # Mirror the route: HTML-strip the body before scanning.
        plain_body = function_app._strip_html(body)
        request = {
            "subject": subject,
            "body": plain_body,
            "from_address": from_address,
            "sender_domain": sender_domain,
            "authentication_results": authentication_results,
            "provider_match_state": entry["provider_match_state"],
            "has_attachments": entry["has_attachments"],
        }
        # attachment_kinds is optional in the manifest (most Tier-2 fixtures are
        # attachment-less). The collision fixtures that carry an image to exercise
        # Rule 0 / Rule 2 supply it explicitly.
        if "attachment_kinds" in entry:
            request["attachment_kinds"] = entry["attachment_kinds"]
        # attachment_filenames is likewise optional -- only the taxonomy-v2
        # case_update fixtures that depend on filename-based report detection
        # (Rule 4c: has_report_attachment) supply it.
        if "attachment_filenames" in entry:
            request["attachment_filenames"] = entry["attachment_filenames"]
        cases.append(
            pytest.param(request, entry["expected"], id=f"tier2-{entry['eml']}")
        )
    return cases


_ALL_CASES = _tier1_cases() + _tier2_cases()


@pytest.mark.parametrize("request_fields,expected", _ALL_CASES)
def test_corpus_fixture_classifies_as_expected(request_fields, expected):
    result = classify_email(**request_fields)
    assert result["category"] == expected["category"], result["signals"]
    assert result["subtype"] == expected["subtype"], result["signals"]
    assert result["contract_version"] == CONTRACT_VERSION


@pytest.mark.parametrize(
    "request_fields,expected",
    [c for c in _ALL_CASES if c.values[1]["category"] == "other"],
)
def test_other_fixtures_have_no_work_or_query_label(request_fields, expected):
    """Abstain-to-other: an ``other`` fixture must NEVER be tagged receiving_work
    or query (a false positive would create or touch a Case it should not)."""
    result = classify_email(**request_fields)
    assert result["category"] == "other"
    assert result["subtype"] == "other"


def test_corpus_covers_all_subtypes():
    """The corpus must exercise every subtype so a regression in any one rule is
    visible (Tier 1 covers the two receiving-work provider subtypes; Tier 2 the
    rest, including the taxonomy-v2 additions — images_received/update_general/
    cancellation_notice — and the taxonomy-v3 additions: payment_remittance
    (TKT-105) + pre_instruction_directions (TKT-084))."""
    seen = {e["expected"]["subtype"] for e in _MANIFEST["tier_1_existing_cases"]}
    seen |= {e["expected"]["subtype"] for e in _MANIFEST["tier_2_synthetic"]}
    assert seen == {
        "existing_provider_instruction",
        "existing_provider_audit",
        "new_client_work",
        "query_existing_work",
        "query_new_enquiry",
        "other",
        "images_received",
        "update_general",
        "cancellation_notice",
        "payment_remittance",
        "pre_instruction_directions",
        "website_general_enquiry",
    }


# --------------------------------------------------------------------------- #
# Pure-function unit checks (independent of the corpus)                       #
# --------------------------------------------------------------------------- #
def test_taxonomy_v4_keeps_the_legacy_positional_call_contract():
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


def test_signals_are_explainable():
    """Every decision lists the rule that fired + the phrases behind it."""
    result = classify_email(
        subject="Quote",
        body="Can you quote a fee for an inspection?",
        provider_match_state="none",
        has_attachments=False,
    )
    assert any(s.startswith("rule:") for s in result["signals"])
    assert any(s.startswith("query_keywords:") for s in result["signals"])


# --------------------------------------------------------------------------- #
# Canonical body_vrm ruleset (collisionspike #7)                             #
# --------------------------------------------------------------------------- #
# REJECT: UK postcode outward codes (B8/LS8/G3/BD8) + security-mail junk
# (BOX2/AT8/LH3/ON26). These were surfaced AS VRMs on the live inbox chip by the
# loose engine VRM_RE; the classifier's canonical sniff must drop them — even when
# a VRM context word sits right beside them (the postcode/junk guard, not just the
# missing anchor, must reject them).
@pytest.mark.parametrize("token", ["B8", "LS8", "G3", "BD8", "BOX2", "AT8", "LH3", "ON26"])
def test_body_vrm_rejects_postcodes_and_junk(token):
    result = classify_email(
        subject=f"Ref {token}",
        body=f"Vehicle reg {token} — please see attached.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["body_vrm"] == "", f"{token!r} must NOT surface as a body_vrm"


# ACCEPT: well-formed UK VRMs (current / prefix / suffix) — surfaced outright.
@pytest.mark.parametrize("token", ["MX17PNL", "AP70WAA", "A123BCD", "ABC123D"])
def test_body_vrm_accepts_wellformed_uk_vrms(token):
    result = classify_email(
        subject="Re: vehicle",
        body=f"Registration {token} relates to the claim.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["body_vrm"] == token


def test_body_vrm_dateless_needs_context_anchor():
    """The loose, dateless shape ([A-Z]{1,3}\\d{1,4}) surfaces ONLY with a nearby VRM
    context word — so it is admitted when anchored but suppressed as a bare token."""
    anchored = classify_email(
        subject="Inspection",
        body="Please note the vehicle reg AB1234 for the file.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert anchored["body_vrm"] == "AB1234"

    bare = classify_email(
        subject="Order",
        body="Our internal job code AB1234 was raised yesterday.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert bare["body_vrm"] == ""


def test_body_vrm_full_postcode_not_surfaced():
    """A full UK postcode (outward + inward) must not surface even with 'reg' nearby."""
    result = classify_email(
        subject="Address",
        body="Reg office: 5 High Street, Leeds LS8 2AB.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["body_vrm"] == ""


def test_wellformed_vrm_rejects_stopword_trigram_without_context():
    """F162 (2026-06-29): the well-formed VRM tier ([A-Z]\\d{1,3} [A-Z]{3}, etc.) matched
    natural-language / model text — 'Any update on the Model X5 now available?' produced
    body_vrm='X5NOW' (the suffix 'NOW' is an English word), feeding the inbox VRM chip /
    corroboration. A well-formed candidate whose 3-letter alpha group spells a stop-word
    is now rejected WHEN no VRM context word sits nearby — but the SAME shape WITH a
    context word is kept (a genuine cherished plate), and plates whose trigram is not a
    stop-word are unaffected (covered by test_body_vrm_accepts_wellformed_uk_vrms)."""
    # The regression: a stop-word-suffixed token in plain prose is NOT a plate.
    noise = classify_email(
        subject="Any update on the Model X5 now available?",
        body="Thanks.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert noise["body_vrm"] == "", noise["signals"]

    # Guard against over-rejection: the same stop-word-suffixed shape WITH a VRM context
    # word IS surfaced (it is a real plate, e.g. a cherished 'GO12 NEW').
    anchored = classify_email(
        subject="Inspection",
        body="Please note the vehicle reg GO12 NEW for the file.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert anchored["body_vrm"] == "GO12NEW"


def test_loose_vrm_survives_unrelated_nearby_postcode():
    """F209 (2026-06-29): the loose-VRM postcode guard scanned the whole ±30-char window,
    so a valid loose reg was dropped whenever an UNRELATED postcode happened to sit
    nearby. The guard is now CANDIDATE-ANCHORED (is the candidate ITSELF a postcode
    outward code?), mirroring the engine's /parse fallback, so a real 'reg AB1234'
    survives even with a separate 'LS8 2AB' in the same sentence."""
    result = classify_email(
        subject="Inspection",
        body="Vehicle reg AB1234, near LS8 2AB please.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["body_vrm"] == "AB1234", result["signals"]


# --------------------------------------------------------------------------- #
# Expanded query wording (collisionspike #8)                                 #
# --------------------------------------------------------------------------- #
def test_update_on_client_chase_is_query_not_other():
    """Regression (#8): a real provider chase ('can we please have an update on our
    client') matched NO keyword pre-fix and fell to 'other'. It must now land 'query'."""
    result = classify_email(
        subject="Our client",
        body="Hi, can we please have an update on our client? Many thanks.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "query"
    assert any(s.startswith("query_keywords:") for s in result["signals"])


def test_update_on_client_chase_from_known_provider_is_query_existing_work():
    """The same chase from a KNOWN provider is query_existing_work (about work we did)."""
    result = classify_email(
        subject="RE: our client",
        body="Please can you advise — any update on our client's report?",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


@pytest.mark.parametrize(
    "body",
    [
        "Please advise on the position with this matter.",
        "Could you advise where this is up to?",
        "We are chasing for information regarding the claim.",
        "Any news on this one?",
        "Where are we with the report?",
        "When will the report be ready?",
        "Just chasing this — awaiting your response.",
        "Please chase this for me when you can.",
    ],
)
def test_expanded_query_phrases_land_in_query(body):
    """Each new #8 phrase, on its own (no work wording, no attachment), lands 'query'
    rather than abstaining to 'other'."""
    result = classify_email(
        subject="Query",
        body=body,
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "query", result["signals"]


def test_expanded_query_phrases_do_not_steal_genuine_work():
    """Guard against over-broadening: an email that BOTH instructs work (attachment +
    work phrase) and asks for an update must STILL be receiving_work — the work rules
    run before the query rules."""
    result = classify_email(
        subject="New instruction",
        body="Please inspect the vehicle and prepare a report. We'd appreciate an update on progress.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"


# --------------------------------------------------------------------------- #
# Reply / query-on-existing-work detection (collisionspike #3)                #
# --------------------------------------------------------------------------- #
# A REPLY about EXISTING work (a chase for more assessment photos on a submitted
# case, a client question after our report went out with our own report re-attached)
# looks like fresh work — a known provider + an attachment — and would otherwise be
# promoted to receiving_work and mint a DUPLICATE Case. ``is_reply`` suppresses that
# promotion into query_existing_work, while a reply that carries a NEW work phrase
# still promotes (precision). AIE's orchestrator keys on the top-level ``is_reply``.
def test_is_reply_field_and_signal_are_surfaced():
    """The contract AIE consumes: a top-level ``is_reply`` boolean AND a ``reply``
    signal token on a reply; both absent/False on a non-reply."""
    reply = classify_email(
        subject="RE: CCPY26050 - your report",
        body="Thank you for your report.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert reply["is_reply"] is True
    assert "reply" in reply["signals"]

    fresh = classify_email(
        subject="New instruction",
        body="Please inspect the vehicle and prepare a report.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert fresh["is_reply"] is False
    assert "reply" not in fresh["signals"]


def test_reply_reattaching_prior_report_is_query_not_work():
    """Headline regression (ST04VRX): a client REPLY after our total-loss report went
    out, re-attaching OUR OWN report (RE: subject, an instruction-kind PDF, a known
    provider, the original Case/PO quoted) — but NO new work phrase and NO query
    keyword. Pre-fix this hit Rule 1 (instruction_doc_existing_provider) on the
    provider + doc and would mint a DUPLICATE Case. ``is_reply`` now suppresses the
    promotion; the quoted Case/PO makes it query_existing_work (Rule 4)."""
    result = classify_email(
        subject="RE: ST04 VRX - total loss report",
        body="Thank you for your report on case CCPY26050, attached again for reference.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert result["is_reply"] is True
    assert result["body_caseref"] == "CCPY26050"
    # The doc carried a provider match + a Case/PO, so it was suppressed as a reply —
    # NOT for lack of corroboration. It must not also carry the contradictory flag.
    assert "uncorroborated_instruction_doc" not in result["signals"]


def test_reply_with_further_assessment_images_is_query_not_work():
    """Headline regression (MX17PNL): a REPLY requesting FURTHER assessment images on
    an already-submitted case (RE: subject, images attached, a known provider, the
    registration in the body) — no new work phrase, no query keyword. Must NOT promote
    to receiving_work; the registration makes it query_existing_work so the orchestrator
    can search the existing Case by VRM."""
    result = classify_email(
        subject="RE: MX17 PNL",
        body="Please can you provide further assessment images for MX17 PNL.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert result["is_reply"] is True
    assert result["body_vrm"] == "MX17PNL"


def test_reply_work_phrase_only_in_quoted_thread_is_still_suppressed():
    """"no NEW work phrase beyond the quoted thread" (collisionspike #3): a client reply
    that quotes OUR OWN report cover note ("please find our engineer's report") carries a
    work phrase in the QUOTED text — but the sender added none. The reply suppression
    keys on sender-written text only, so this is still query_existing_work, NOT
    receiving_work. The full text is still scanned for the Case/PO (surfaced for the
    open-Case lookup)."""
    result = classify_email(
        subject="RE: total loss report",
        body=(
            "Thank you, I have shared this with my client.\n\n"
            "-----Original Message-----\n"
            "From: engineers@collisionengineers.example.com\n"
            "Please find attached our engineer's report for case CCPY26050.\n"
        ),
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"
    assert result["is_reply"] is True
    assert result["body_caseref"] == "CCPY26050"  # still found in the quoted thread

    # The SAME quoted work phrase, but the SENDER also writes a fresh instruction, must
    # promote (the new work phrase is in the sender-written text, not just the quote).
    promotes = classify_email(
        subject="RE: total loss report",
        body=(
            "Thanks. Separately, please inspect AB12 CDE and prepare a report.\n\n"
            "-----Original Message-----\n"
            "Please find attached our engineer's report for case CCPY26050.\n"
        ),
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert promotes["category"] == "receiving_work"


def test_genuine_new_instruction_that_is_a_reply_still_receiving_work():
    """Precision guard: a provider who REPLIES on an existing thread with a genuinely
    NEW instruction ("and here's the next job") — a fresh instruction doc, a new
    Case/PO, and real work language ("please inspect", "prepare a report") — must STILL
    be receiving_work. The NEW work phrase is the discriminator: ``is_reply`` only
    suppresses when there is NO new work language, so this is not suppressed."""
    result = classify_email(
        subject="RE: ongoing matters - and the next one",
        body="Please also inspect AB12 CDE and prepare a report. Our new ref ALS26099.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"
    assert result["is_reply"] is True  # it IS a reply ...
    assert "reply" in result["signals"]  # ... and the signal is surfaced ...
    assert result["signals"][-1] == "rule:instruction_doc_existing_provider"  # ... but it still promotes


def test_forward_is_not_a_reply_and_still_promotes():
    """A FORWARD ("FW:"/"FWD:") is an onward-send, NOT a reply — it may carry a
    genuinely new instruction onward, so it must not trip the reply suppression. A
    forwarded fresh instruction from a known provider still promotes, and ``is_reply``
    is False even though it has a 'FW:' prefix."""
    for subject in ("FW: new instruction", "FWD: please inspect"):
        result = classify_email(
            subject=subject,
            body="Please inspect the vehicle and prepare a report.",
            provider_match_state="one",
            attachment_kinds=["instruction"],
            has_attachments=True,
        )
        assert result["is_reply"] is False, subject
        assert result["category"] == "receiving_work", subject
        assert "reply" not in result["signals"], subject


def test_is_reply_derived_from_threading_headers_when_no_re_subject():
    """When the orchestrator passes the RFC-5322 In-Reply-To / References headers, they
    are the authoritative reply signal even with a plain (no 'RE:') subject — and they
    drive the same suppression. (Wiring the headers through the route would strengthen
    the signal beyond the subject-only fallback.)"""
    by_in_reply_to = classify_email(
        subject="Total loss report",  # no RE: prefix
        body="Thank you for your report on case CCPY26050, attached again.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
        in_reply_to="<CAF=msg-id-123@mail.example.com>",
    )
    assert by_in_reply_to["is_reply"] is True
    assert by_in_reply_to["category"] == "query"
    assert by_in_reply_to["subtype"] == "query_existing_work"

    by_references = classify_email(
        subject="Total loss report",
        body="Comments on CCPY26050 below.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
        references="<a@mail> <b@mail>",
    )
    assert by_references["is_reply"] is True
    assert by_references["category"] == "query"


def test_re_inspection_without_colon_is_not_a_reply():
    """Guard against a false reply trigger: 'Re-inspection' (no colon) is a word, NOT a
    'RE:' reply prefix — it must not set is_reply, so a genuine audit re-inspection
    instruction is unaffected by the reply suppression."""
    result = classify_email(
        subject="Re-inspection request to Engineers 2",
        body="An audit report is required of the original engineer's findings.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["is_reply"] is False
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_audit"


def test_bare_acknowledgement_reply_is_non_actionable():
    """TKT-038: a reply whose sender-written text is only a short pleasantry ("Thanks,
    noted.") asks nothing and instructs nothing — it is no-action. It must NOT be
    receiving_work, and is now recognised as ``non_actionable`` / ``acknowledgement``
    rather than the generic ``other`` (more informative for the inbox)."""
    result = classify_email(
        subject="RE: your email",
        body="Thanks, noted.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"
    assert result["is_reply"] is True


def test_reply_inherited_subject_work_phrase_does_not_defeat_suppression():
    """F467 (2026-06-29): a reply's SUBJECT is inherited from the original thread, not
    freshly written. Pre-fix the "new work phrase" discriminator scanned subject+body, so
    a work phrase carried in the inherited subject ('RE: New instruction CCPY26050 -
    please inspect') kept the reply OUT of the suppression and it wrongly promoted to
    receiving_work, minting a DUPLICATE Case. The discriminator now keys on the sender-
    written BODY only, so a reply whose body adds no new work language is suppressed to
    query_existing_work (the quoted Case/PO makes it about work we did)."""
    result = classify_email(
        subject="RE: New instruction CCPY26050 - please inspect",
        body="Thanks for your note.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    # The inherited-subject work phrase must NOT promote to receiving_work. The body is
    # a bare pleasantry, so it lands non_actionable/acknowledgement (TKT-038) — NOT a
    # duplicate Case. The Case/PO is still surfaced (for the orchestrator).
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"
    assert result["is_reply"] is True
    assert result["body_caseref"] == "CCPY26050"

    # Precision guard (unchanged): when the SENDER's own BODY carries the new work
    # phrase, the same inherited-subject reply STILL promotes — the body is freshly
    # written, so this is a genuine "and here's the next job".
    promotes = classify_email(
        subject="RE: New instruction CCPY26050 - please inspect",
        body="Thanks — please also inspect AB12 CDE and prepare a report.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert promotes["category"] == "receiving_work"
    assert promotes["subtype"] == "existing_provider_instruction"


# --------------------------------------------------------------------------- #
# Hardening helpers (collisionspike TKT-021..040)                             #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "text,expected",
    [
        ("Our Ref: SAB/46286/1 please advise", "SAB/46286/1"),
        ("Our Ref: HMA/46428/1, Vehicle: WN14XPZ", "HMA/46428/1"),
        ("Your Ref: 45391/1", "45391/1"),
        ("Our Ref: 206848.001 - new matter", "206848.001"),
        ("ref kbs26067 enclosed", "KBS26067"),
        ("the claim SAB_46286_1 is open", "SAB_46286_1"),  # structured, no label
        ("just a normal sentence with no reference", ""),
        ("ref: see attached", ""),  # labelled but no digit -> not a ref
    ],
)
def test_job_reference_extractor(text, expected):
    assert _job_reference(text) == expected


@pytest.mark.parametrize(
    "filename,is_report",
    [
        ("Engineer Report.pdf", True),
        ("EngineersReport-V1.pdf", True),
        ("engineers report v2.docx", True),
        ("TL Report.pdf", True),
        ("Final Report.pdf", True),
        ("To Engineer with instructions.DOC", False),
        ("Credit_Repair_Engineer_Instruction_46203.pdf", False),
        ("claim form.pdf", False),
        ("photo.jpg", False),
    ],
)
def test_has_report_attachment(filename, is_report):
    assert _has_report_attachment([filename]) is is_report


@pytest.mark.parametrize(
    "subject,is_reply_expected",
    [
        ("RE: 30143 - Mussie Belay - BX67OEY", True),   # no colon-space form is real Outlook
        ("RE 30143 - Mussie Belay", True),               # no colon at all
        ("Re: your report", True),
        ("Re-inspection request", False),                # glued hyphen, NOT a reply
        ("Review of costs", False),                      # 'Re' glued to a letter
        ("FW: new instruction", False),                  # forward, not reply
        ("FWD: please inspect", False),
        # collisionspike P0-2: the Robert James "Re:NNNNNN.NNN" reference-scheme is
        # glued straight onto a bare colon with NO space -> NOT a reply (a fresh
        # instruction, no threading header behind it).
        ("Re:128086.001/Mr I Saleem", False),
        ("Re:100875.003/Mr J Siranseevi", False),
        ("Re:127774.001/Mr H Saleem", False),
        # ... but an OUTER "RE: " (with space) onto that same scheme IS a reply.
        ("RE: Re:127581.001/Mr E Taullaj", True),
        # A header-less Case/PO reply with real words after it stays a reply.
        ("RE: CCPY26050 - your report", True),
    ],
)
def test_relaxed_reply_detection(subject, is_reply_expected):
    assert _is_reply(subject, "", "") is is_reply_expected


# --------------------------------------------------------------------------- #
# Email-classifier hardening — verified 29-email analysis (collisionspike)     #
# --------------------------------------------------------------------------- #
def test_p0_1_instruction_boilerplate_not_demoted_by_copy_of_report():
    """P0-1: the standard solicitor instruction boilerplate ('arrange to inspect our
    client's vehicle and thereafter forward a copy of the report to ourselves') used to
    trip the bare 'copy of the/your report' chase phrase, which suppressed the genuine
    NEW instruction into query_existing_work. The bare phrases were removed from
    chase_phrases; a real chase asking us to SEND our report ('provide us with a copy of
    your report') still suppresses (see test_p0_1_genuine_chaser_still_query)."""
    result = classify_email(
        subject="Our Ref: AM.8540.PI  Client: Mr Muhammad Nawazish",
        body=(
            "Our Ref: AM.8540.PI Vehicle Reg: ND14 BFX. We act on behalf of the above "
            "named client and would be grateful if you would kindly arrange to inspect "
            "our client's vehicle and thereafter forward a copy of the report to "
            "ourselves in duplicate."
        ),
        sender_domain="tenlegal.co.uk",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "receiving_work", result["signals"]
    assert result["subtype"] == "existing_provider_instruction"
    assert result["body_vrm"] == "ND14BFX"


def test_p0_1_genuine_chaser_still_query():
    """P0-1 guard: a genuine chase that asks us to SEND our report must STILL suppress to
    a query (the removal targeted only the ambiguous BARE 'copy of the/your report'; the
    verb-led chasers stay)."""
    for chase in (
        "Please provide us with a copy of your report by return.",
        "Please send us a copy of your report.",
        "We are still awaiting your report.",
    ):
        result = classify_email(
            subject="RE: 30143 - our client",
            body=chase,
            provider_match_state="one",
            attachment_kinds=["image"],
            attachment_filenames=["image001.png"],
            has_attachments=True,
            in_reply_to="<orig@mail>",
        )
        assert result["category"] == "query", (chase, result["signals"])


@pytest.mark.parametrize(
    "subject,body",
    [
        # Robert James "Re:128086.001" scheme + an instruction doc, no threading header.
        ("Re:128086.001/Mr I Saleem", "Good afternoon, Please find vetting attached."),
        # Ten Legal-style body instruction, no colon-scheme.
        ("Our Ref: NV.8541.VD  Client: Mr Belal Hussain",
         "Vehicle Reg: KW20 VEH. We would be grateful if you would kindly arrange to "
         "inspect our client's vehicle and forward a copy of the report to ourselves."),
    ],
)
def test_p0_2_false_reply_scheme_reaches_work(subject, body):
    """P0-2: a fresh instruction whose subject carries the Robert James 'Re:NNNNNN.NNN'
    reference-scheme (or a Ten Legal-style body instruction) must NOT be suppressed to a
    query by a spurious is_reply — with the false-reply fix it reaches receiving_work."""
    result = classify_email(
        subject=subject,
        body=body,
        provider_match_state="one",
        attachment_kinds=["instruction"] if "vetting" in body else None,
        has_attachments="vetting" in body,
    )
    assert result["is_reply"] is False, result["signals"]
    assert result["category"] == "receiving_work", result["signals"]


@pytest.mark.parametrize(
    "phrase,anchor",
    [
        ("Please arrange to inspect our client's vehicle.", "arrange to inspect"),
        ("Please see attached letter of instructions.", "letter of instructions"),
        ("Please complete a private report on this one.", "complete a private report"),
        ("Please complete a report on the attached.", "complete a report"),
        ("This is a new private instruction.", "private instruction"),
    ],
)
def test_p0_3_work_anchor_phrases_are_recognised(phrase, anchor):
    """P0-3: each high-precision anchor phrase is now recognised as work language (it
    fires the work_keywords signal). These are the phrases that rescue Ten Legal / Baker
    Coleman / Accident Specialist samples — corroboration into receiving_work is exercised
    end-to-end by test_p0_1_instruction_boilerplate_not_demoted_by_copy_of_report."""
    result = classify_email(
        subject="Instruction",
        body=phrase,
        provider_match_state="one",
        has_attachments=False,
    )
    assert any(
        s.startswith("work_keywords:") and anchor in s for s in result["signals"]
    ), result["signals"]


def test_p0_3_two_anchor_phrases_promote_body_instruction():
    """P0-3 promotion: two anchor phrases + a body VRM (no attachment) clears Rule 3's
    two-phrase floor and promotes — the exact shape of the Ten Legal samples."""
    result = classify_email(
        subject="Our Ref: NV.8541.VD",
        body="We would arrange to inspect our client's vehicle. Vehicle reg KW20 VEH.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "receiving_work", result["signals"]


def test_p1_4a_solicitor_rta_ref_not_a_caseref():
    """P1-4a: an 'RTA135983.001' solicitor ref must NOT be mis-read as a CE Case/PO by
    truncating its '.001' — it routes to body_jobref (the whole dotted ref) instead, and
    a genuine CE Case/PO is unaffected."""
    result = classify_email(
        subject="RE: RTA135983.001 - Mr L Safdar",
        body="Please find attached.",
        provider_match_state="one",
        references="<thread@mail>",
    )
    assert result["body_caseref"] == ""
    assert result["body_jobref"] == "RTA135983.001"

    ce = classify_email(subject="New instruction CCPY26050", body="Please inspect.")
    assert ce["body_caseref"] == "CCPY26050"


@pytest.mark.parametrize(
    "text,expected_jobref",
    [
        ("New claim Instructions PHA 5013 - YH08 MWS", "PHA5013"),   # P1-4b space form
        ("Fw: Scott Gibson Bodyshop ID: 55837 / Christie", "55837"),  # P1-4c 'id' label
        ("Suite 303A The Pentagon Centre", ""),   # title-case address must NOT capture
    ],
)
def test_p1_4bc_reference_extraction(text, expected_jobref):
    assert _job_reference(text) == expected_jobref


def test_p1_5_reply_delivering_images_is_case_update():
    """P1-5: a reply that DELIVERS damage photos on an existing job (genuine non-signature
    image attachments, no question asked) is case_update/images_received — it must be
    caught BEFORE Rule 4b would label it query_existing_work."""
    result = classify_email(
        subject="RE: Ref: 506115",
        body="Dear Sirs, Please find attached correspondence herewith for your attention.",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["image001.png", "IMG_9108.jpeg", "IMG_9109.jpeg"],
        has_attachments=True,
        references="<thread@mail>",
    )
    assert result["category"] == "case_update", result["signals"]
    assert result["subtype"] == "images_received"
    assert result["is_reply"] is True


def test_p1_5_reply_asking_for_images_stays_query():
    """P1-5 guard: a reply that ASKS for further images (a chase, no delivered photo) must
    NOT be promoted to case_update — it stays a query."""
    result = classify_email(
        subject="RE: MX17 PNL",
        body="Please can you provide further assessment images for MX17 PNL.",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["image001.png"],  # signature logo only
        has_attachments=True,
        references="<thread@mail>",
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


def test_p1_5_reply_with_only_signature_logos_not_case_update():
    """P1-5 precision: a bare 'Thanks' reply carrying only inline signature logos
    ('imageNNN.png') must NOT be read as delivered evidence (that raster typing is
    TKT-047) — it stays a bare acknowledgement."""
    assert _has_new_image_evidence(["image001.png", "image002.png"]) is False
    result = classify_email(
        subject="RE: 45391/1",
        body="Thanks, noted.",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["image001.png", "image002.png"],
        has_attachments=True,
        references="<thread@mail>",
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"


def test_delivered_images_only_signature_aware():
    """PR#45: the all-image KIND fast-path must not short-circuit to True on a set made only
    of signature logos (imageNNN.png). Kept in lockstep with the orchestrator's
    deriveAttachmentSignals.deliveredImagesOnly."""
    # signature logo(s) only -> False (was True via the kind fast-path before the fix)
    assert _delivered_images_only(["image"], ["image001.png"]) is False
    assert _delivered_images_only(["image", "image"], ["image001.png", "image002.png"]) is False
    # a real photo alongside a signature -> True (the non-signature photo is genuine evidence)
    assert _delivered_images_only(["image", "image"], ["damage-front.jpg", "image001.png"]) is True
    # a set of real photos -> True (unchanged)
    assert _delivered_images_only(["image", "image"], ["IMG_9108.jpeg", "IMG_9109.jpeg"]) is True
    # photos-in-a-PDF (filename tier, TKT-043) -> True (regression guard)
    assert _delivered_images_only(["instruction"], ["images - cvd.pdf"]) is True
    # an engineer's report among the delivered files -> False (unchanged)
    assert _delivered_images_only(["image", "instruction"], ["photo.jpg", "Engineer Report.pdf"]) is False


def test_p2_6_soft_confirmation_is_query():
    """P2-6: a soft confirmation ('Can I confirm has everything needed for the report been
    sent') matched no keyword pre-fix and fell to 'other'. It must now land 'query'."""
    result = classify_email(
        subject="RE: Oakwood Scotland Solicitors- Instructions",
        body="Can I confirm has everything needed for the report been sent.",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["image001.png"],
        has_attachments=True,
        references="<thread@mail>",
    )
    assert result["category"] == "query", result["signals"]


def test_bare_acknowledgement_keys_on_first_line_despite_signature():
    """TKT-038: 'Thanks Ed' followed by a long email signature is still a bare ack."""
    assert _is_bare_acknowledgement("Thanks Ed\n\nLouise Pullan\nRecoveries Manager\n0800 093 0982\n...") is True
    assert _is_bare_acknowledgement("Thanks, noted.") is True
    # A substantive first line is NOT a bare ack (stays a linkable query).
    assert _is_bare_acknowledgement("Thank you, I have shared this with my client.") is False
    # A pleasantry that also asks is NOT a bare ack.
    assert _is_bare_acknowledgement("Thanks. Where is the report?") is False


def test_outlook_quoted_header_is_stripped_from_sender_text():
    """The Outlook 'From:/Sent:/To:/Subject:' quote header (the common provider reply
    convention, not '-----Original Message-----') must be stripped so the quoted original
    instruction below it does not contaminate the sender-written scope (TKT-030/038)."""
    body = (
        "Thanks Ed\n\nKind regards\nLouise\n"
        "From: Desk \nSent: Tuesday, June 30, 2026 9:59 AM\nTo: Louise\n"
        "Subject: RE: Our Ref 45391/1\n\nPlease inspect the vehicle and prepare a report.\n"
    )
    sender = _sender_written_text(body)
    assert "please inspect" not in sender.lower()
    assert "thanks ed" in sender.lower()


def test_invoice_request_routes_to_billing():
    """TKT-037: 'please provide the invoice' with our report attached is a billing
    request, never a new Case."""
    result = classify_email(
        subject="Your Ref: kbs26067 // Our Ref: 303671",
        body="Good Afternoon, Please provide the invoice for the attached report.",
        provider_match_state="one",
        attachment_kinds=["image", "instruction"],
        attachment_filenames=["image001.png", "Engineer Report.pdf"],
        has_attachments=True,
    )
    assert result["category"] == "billing"
    assert result["subtype"] == "billing_request"
    assert "report_attachment" in result["signals"]


def test_remittance_advice_routes_to_payment_remittance():
    """TKT-105 (taxonomy v3): an inbound payment advice ('remittance advice') routes to
    billing · payment_remittance — the payments lane — and NEVER to billing_request
    (this preserves the ORIGINAL guard's spirit: a remittance is not us being asked
    for an invoice). Before the payments lane existed this deliberately abstained."""
    result = classify_email(
        subject="Remittance advice - June",
        body="Please find our remittance advice for June. The payment will reach your account shortly.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "billing", result["signals"]
    assert result["subtype"] == "payment_remittance"


def test_case_summary_digest_routes_to_non_actionable():
    """TKT-029: a recap of instructions already sent (an instruction-kind PDF attached,
    a plural 'inspection requests' subject) must NOT mint a Case — it is non_actionable."""
    result = classify_email(
        subject="New inspection requests",
        body="Please find attached a summary of the instructions sent yesterday showing the status of the inspections.",
        provider_match_state="one",
        attachment_kinds=["image", "instruction"],
        attachment_filenames=["0.png", "Credit_Repair_Engineer_Instruction_46203.pdf"],
        has_attachments=True,
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "case_summary"


def test_informal_work_with_photos_and_identifier_promotes():
    """TKT-040: an informal triage request (no formal 'please inspect') with damage photos
    AND a job identifier is genuine work; the same wording with NO identifier abstains."""
    promoted = classify_email(
        subject="(EREF5) RTA on 27/06/2026 : Mr Ahmed (Our Ref: HMA/46428/1, Vehicle: WN14XPZ)",
        body="Triage Only Request. Please provide an initial assessment to confirm if this vehicle is roadworthy and repairable.",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["CLVDamage5-V1.jpg"],
        has_attachments=True,
    )
    assert promoted["category"] == "receiving_work"

    bare = classify_email(
        subject="quick one",
        body="Can you confirm if this vehicle is roadworthy?",  # informal, but no id and no images
        provider_match_state="none",
        has_attachments=False,
    )
    assert bare["category"] != "receiving_work"


def test_report_chaser_reply_is_query_not_new_work():
    """TKT-030/033: a chase reply ('please provide engineers report') whose quoted history
    below holds the original multi-phrase instruction must be a query, not new work — the
    promotion signals are sender-scoped and the chase phrase suppresses."""
    result = classify_email(
        subject="RE: 30143 - Mussie Belay - BX67OEY",
        body=(
            "Good morning\nPlease provide engineers report.\n\n"
            "From: Info\nSent: Wednesday, June 24, 2026 3:44 PM\nTo: Engineers\n"
            "Subject: 30143\n\nWe instruct you to inspect the vehicle and prepare a report. Please inspect.\n"
        ),
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["image003.jpg"],
        has_attachments=True,
        in_reply_to="<orig@mail>",
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


# --------------------------------------------------------------------------- #
# Acknowledgement / query / case_update batch (collisionspike TKT-081/082/083/093) #
# --------------------------------------------------------------------------- #
def test_tkt081_greeting_then_thanks_is_acknowledgement():
    """TKT-081 s1: a reply that opens with a GREETING line then a bare 'thank you' (with a
    signature below) — the greeting must not defeat the ack sniff. It lands
    non_actionable/acknowledgement, not a query off the inherited-subject ref/VRM."""
    result = classify_email(
        subject="RE: Mr A Client - AB12 CDE",
        body="Good morning,\n\nThank you for this!\n\nSarah\nClaims handler\n0123 456 789",
        provider_match_state="none",
        has_attachments=False,
        references="<thread@mail>",
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"
    assert result["is_reply"] is True


def test_tkt081_reaction_notification_is_acknowledgement():
    """TKT-081 s3: an Outlook/Teams 'reacted to your message' notification is a
    non-actionable acknowledgement, not a query on the quoted-thread reference."""
    result = classify_email(
        subject="RE: RTA claim - AB12 CDE",
        body=(
            "[like] Desk reacted to your message:\n"
            "________________________________\n"
            "From: Provider\nSubject: RE: claim\n\nNo problem and thank you for this\n"
        ),
        provider_match_state="one",
        has_attachments=False,
        references="<thread@mail>",
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"


def test_tkt081_automated_acknowledgement_makes_no_case():
    """TKT-081 s2 (the SEVERE one): an automated 'thank you for your email' auto-reply with
    signature images (and boilerplate 'new claim') must NOT promote to receiving_work and
    mint a blank Case — the auto-reply markers + Rule-0 auto-acknowledgement branch route
    it to non_actionable/acknowledgement."""
    result = classify_email(
        subject="Thank you for your email",
        body=(
            "This is an automated email, please do not respond directly to this email\n\n"
            "Thank you for your email. Our claims team will review this against the claim you submitted.\n\n"
            "In the meantime you can submit new claims online.\n\nKind regards\nTheresa"
        ),
        provider_match_state="none",
        attachment_kinds=["image"],
        attachment_filenames=["image001.png"],
        has_attachments=True,
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"
    assert result["signals"][-1] == "rule:auto_acknowledgement"


def test_tkt081_greeting_relaxes_ack_cap_but_terse_line_stays_query():
    """TKT-081 s4: after a greeting is skipped, a slightly longer courtesy close ('thank
    you, we will wait to hear back on this one') is still a bare acknowledgement — but the
    SAME line with no greeting keeps the tight bound and stays a linkable query (preserving
    the greeting-less substantive-reply invariant)."""
    ack = classify_email(
        subject="RE: (EREF) claim - AB12 CDE (Our Ref: TG/123/1)",
        body="Hi Ed\n\nThank you, we will wait to hear back on this one.\n\nLouise\nRecoveries Manager",
        provider_match_state="one",
        has_attachments=False,
        references="<thread@mail>",
    )
    assert ack["category"] == "non_actionable"
    assert ack["subtype"] == "acknowledgement"
    # Greeting-LESS, the same courtesy clause is not a bare ack (the tight 40-char bound
    # holds), so a substantive one-liner stays a linkable query.
    assert _is_bare_acknowledgement("Thank you, we will wait to hear back on this one.") is False


def test_tkt082_question_about_your_report_is_query_not_new_work():
    """TKT-082 s1: a question ABOUT our existing engineer's report carries the 'engineers
    report' work keyword + an instruction-kind PDF, but the possessive 'your report'
    about-existing signal suppresses the false promotion — query_existing_work, not
    new_client_work."""
    result = classify_email(
        subject="Client: Mr A Client // Engineer Instruction - VRN: AB12 CDE",
        body=(
            "Good Morning,\n\nPlease can you assist on the matter related to your attached "
            "Engineers Report. Out of the 18 hours quoted in your report, how many are for paint?"
        ),
        provider_match_state="none",
        attachment_kinds=["instruction"],
        attachment_filenames=["AB12CDE.pdf"],
        has_attachments=True,
        references="<thread@mail>",
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


def test_tkt083_body_instruction_one_phrase_with_ref_and_vrm_promotes():
    """TKT-083: a fresh body-only 'New INSTRUCTIONS:' email with only ONE work phrase but a
    full identifier set (a job ref AND a VRM) promotes to receiving_work — the ref+VRM
    corroboration substitutes for the two-phrase floor. Without both anchors it still
    abstains."""
    promoted = classify_email(
        subject="Our Ref: 30230-01 ; Vehicle Registration Number: AB72 YVB",
        body=(
            "New INSTRUCTIONS:\n\nOur Ref: 30230-01\nVehicle Registration Number: AB72YVB\n"
            "Accident Location: High Street\nCircumstance: our client was waiting at the lights."
        ),
        provider_match_state="none",
        has_attachments=False,
    )
    assert promoted["category"] == "receiving_work"
    assert promoted["subtype"] == "new_client_work"
    assert promoted["body_jobref"] == "30230-01"

    # A single work phrase with NEITHER a ref nor a VRM still abstains (the floor holds).
    weak = classify_email(
        subject="Note",
        body="New instruction to follow shortly.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert weak["category"] == "other"


def test_tkt093_forward_delivering_document_is_case_update_not_new_work():
    """TKT-093: a FORWARD whose inherited subject carries an inspection-request / audit cue
    but whose SENDER wrote only a delivery note ('Audatex attached') must not promote on
    the inherited subject — it is case_update (additional documentation on the matched open
    case), anchored by the vehicle registration."""
    result = classify_email(
        subject="FW: RE: Enclosing Inspection Request to Engineers 2 - 577298",
        body="Hi Neil\n\nAudatex attached for vehicle BE57 JDS.\n\nThanks\nColette",
        provider_match_state="one",
        attachment_kinds=["instruction", "image"],
        attachment_filenames=["AJB14044.AudatexMS.pdf", "image001.png"],
        has_attachments=True,
    )
    assert result["is_reply"] is False
    assert result["category"] == "case_update"
    assert result["subtype"] == "update_general"


# --------------------------------------------------------------------------- #
# open_case_ref_match context input (collisionspike TKT-043)                   #
# --------------------------------------------------------------------------- #
def _tkt043_chaser(**over):
    """A work-shaped chaser DELIVERING a photos-PDF on a named case — the real
    TKT-043 sample shape. The pure text is genuinely work-shaped ("Engineers report
    is required on the following case: ...<PO>..." + an instruction-kind PDF), so only
    the flow's open-case match can tell "update on an open case" from "fresh work"."""
    kw = dict(
        subject="RE: Ref:160404/GN14GBE/Nissan Qashqai Tekna - Chaser for engineers report",
        body="Engineers report is required on the following case:\n\n160404\n\nUn-Roadworthy\nGN14GBE\n",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["images - cvd.pdf"],
        has_attachments=True,
    )
    kw.update(over)
    return classify_email(**kw)


def test_tkt043_open_case_ref_match_routes_images_pdf_to_case_update():
    """TKT-043: with the flow's open-case match resolved (``one``), the chaser routes to
    case_update/images_received — the FILENAME tier of _delivered_images_only catches the
    photos-in-a-PDF the extension-derived kind reads as 'instruction'."""
    result = _tkt043_chaser(open_case_ref_match="one")
    assert result["category"] == "case_update", result["signals"]
    assert result["subtype"] == "images_received"
    assert "open_case_ref_match:one" in result["signals"]


def test_tkt043_default_stays_fresh_work_without_open_case_signal():
    """Kill-switch: absent/``none`` open_case_ref_match leaves the label EXACTLY as today —
    the flip is driven only by the resolved open-case context, never a per-sample hard-code."""
    assert _tkt043_chaser()["category"] == "receiving_work"
    assert _tkt043_chaser(open_case_ref_match="none")["category"] == "receiving_work"


def test_tkt043_open_case_ref_match_ambiguous_suppresses_fresh_work():
    """An ambiguous open-case match still means "belongs to an existing case, not fresh
    work" — routed into the case_update lane; the ACTION is the triage-policy layer's call."""
    assert _tkt043_chaser(open_case_ref_match="ambiguous")["category"] == "case_update"


# --------------------------------------------------------------------------- #
# Golden ticket corpus — the real misclassified emails (collisionspike)       #
# --------------------------------------------------------------------------- #
# Each ticket's actual .eml under docs/tickets/<id>/**/ is run through the classifier
# with its real attachments + threading headers. A regression that re-breaks any ticket
# flips its row red. (These are the live failures TKT-029..040 document.)
_TICKETS_DIR = os.path.join(_REPO_ROOT, "docs", "tickets")
_EXT_TO_KIND = {
    "jpg": "image", "jpeg": "image", "png": "image",
    "pdf": "instruction", "docx": "instruction", "doc": "instruction", "eml": "email",
}
# (ticket-id glob, sender-domain provider-match state, expected category)
_TICKET_EXPECT = [
    ("TKT-029", "one", "non_actionable"),
    ("TKT-030", "one", "query"),
    ("TKT-031", "one", "query"),
    ("TKT-033", "one", "query"),
    ("TKT-036", "one", "receiving_work"),
    ("TKT-037", "one", "billing"),
    ("TKT-038", "one", "non_actionable"),
    ("TKT-039", "one", "query"),
    ("TKT-040", "one", "receiving_work"),
]


def _kind_of(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _EXT_TO_KIND.get(ext, "other")


def _load_ticket_eml(ticket_id: str):
    import glob
    matches = sorted(glob.glob(os.path.join(_TICKETS_DIR, f"{ticket_id}*", "**", "*.eml"), recursive=True))
    if not matches:
        return None
    with open(matches[0], "rb") as fh:
        msg = email.message_from_bytes(fh.read(), policy=email.policy.default)
    filenames, body = [], ""
    for part in msg.walk():
        fn = part.get_filename()
        if fn:
            filenames.append(fn)
        elif part.get_content_type() == "text/plain":
            body += part.get_content()
        elif part.get_content_type() == "text/html" and not body:
            body += part.get_content()
    return msg, filenames, function_app._strip_html(body)


@pytest.mark.parametrize("ticket_id,match_state,expected_category", _TICKET_EXPECT)
def test_ticket_email_classifies_into_expected_category(ticket_id, match_state, expected_category):
    loaded = _load_ticket_eml(ticket_id)
    if loaded is None:
        pytest.skip(f"{ticket_id}: no .eml present in docs/tickets")
    msg, filenames, plain_body = loaded
    result = classify_email(
        subject=msg["subject"] or "",
        body=plain_body,
        sender_domain=(msg["from"] or "").split("@")[-1].strip("> ").lower(),
        provider_match_state=match_state,
        attachment_kinds=sorted({_kind_of(f) for f in filenames}),
        attachment_filenames=filenames,
        has_attachments=bool(filenames),
        in_reply_to=msg["in-reply-to"] or "",
        references=msg["references"] or "",
    )
    assert result["category"] == expected_category, (
        f"{ticket_id}: got {result['category']}/{result['subtype']} — {result['signals']}"
    )


# --------------------------------------------------------------------------- #
# The POST /classify-email route                                             #
# --------------------------------------------------------------------------- #
def _make_request(body) -> func.HttpRequest:
    payload = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode("utf-8")
    return func.HttpRequest(
        method="POST",
        url="http://localhost/api/classify-email",
        headers={"Content-Type": "application/json"},
        body=payload,
    )


def test_route_happy_path_returns_label_and_contract():
    resp = function_app.classify_email_route(
        _make_request(
            {
                "subject": "New instruction",
                "body": "Please inspect the vehicle and prepare a report.",
                "sender_domain": "qdoslegal.example.co.uk",
                "provider_match_state": "one",
                "attachment_kinds": ["instruction"],
                "has_attachments": True,
            }
        )
    )
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["category"] == "receiving_work"
    assert data["subtype"] == "existing_provider_instruction"
    assert data["contract_version"] == CONTRACT_VERSION


def test_route_passes_recipient_authentication_into_website_rule():
    resp = function_app.classify_email_route(
        _make_request(
            {
                "subject": "New General Enquiry - Example",
                "body": (
                    "General Enquiry from the Website\n"
                    "Submitted via the Collision Engineers website contact form."
                ),
                "from": "Collision Engineers <mail@noreply.collisionengineers.co.uk>",
                "sender_domain": "noreply.collisionengineers.co.uk",
                "authentication_results": (
                    "dmarc=pass header.from=noreply.collisionengineers.co.uk; compauth=pass"
                ),
            }
        )
    )
    assert resp.status_code == 200
    assert json.loads(resp.get_body())["category"] == "website_enquiry"


def test_route_html_body_is_stripped_before_scanning():
    """An HTML body must classify the same as its plain-text equivalent — the route
    strips tags server-side."""
    resp = function_app.classify_email_route(
        _make_request(
            {
                "subject": "Chasing report",
                "body": "<html><body><p>Where is my report for <b>AB12 CDE</b>?</p><p>Any update?</p></body></html>",
                "provider_match_state": "one",
                "has_attachments": False,
            }
        )
    )
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["category"] == "query"
    assert data["subtype"] == "query_existing_work"
    assert data["body_vrm"] == "AB12CDE"


def test_route_passes_threading_headers_and_surfaces_is_reply():
    """The route accepts the In-Reply-To / References headers and the response carries
    the top-level ``is_reply`` boolean AIE's orchestrator keys on. A reply that
    re-attaches a prior report (no new work phrase) lands query_existing_work, not
    receiving_work — even with a plain (no 'RE:') subject — because the header marks it
    a reply."""
    resp = function_app.classify_email_route(
        _make_request(
            {
                "subject": "Total loss report",
                "body": "Thank you for your report on case CCPY26050, attached again.",
                "sender_domain": "als.example.co.uk",
                "provider_match_state": "one",
                "attachment_kinds": ["instruction"],
                "has_attachments": True,
                "in_reply_to": "<CAF=msg-id-123@mail.example.com>",
            }
        )
    )
    assert resp.status_code == 200
    data = json.loads(resp.get_body())
    assert data["is_reply"] is True
    assert "reply" in data["signals"]
    assert data["category"] == "query"
    assert data["subtype"] == "query_existing_work"


def test_route_rejects_non_string_threading_header():
    """A non-string In-Reply-To / References is a bad field (mirrors the other string
    fields)."""
    resp = function_app.classify_email_route(
        _make_request({"subject": "x", "body": "y", "references": 123})
    )
    assert resp.status_code == 400
    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "bad_field"
    assert data["is_reply"] is False  # error envelope shares the success schema


def test_route_bad_json_returns_400_with_safe_other_label():
    resp = function_app.classify_email_route(_make_request(b"this is not json"))
    assert resp.status_code == 400
    data = json.loads(resp.get_body())
    # Even on a bad request the envelope carries the safe catch-all label.
    assert data["category"] == "other"
    assert data["subtype"] == "other"
    assert data["issues"][0]["code"] == "bad_request"


def test_route_non_object_body_returns_400():
    resp = function_app.classify_email_route(_make_request([1, 2, 3]))
    assert resp.status_code == 400
    data = json.loads(resp.get_body())
    assert data["category"] == "other"


def test_route_bad_field_type_returns_400():
    resp = function_app.classify_email_route(
        _make_request({"subject": 123, "body": "hello"})
    )
    assert resp.status_code == 400
    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "bad_field"


def test_route_unexpected_error_becomes_500_not_502(monkeypatch):
    """Mirror /parse's last-line-of-defence: an unexpected internal error returns a
    structured 500, never an escaped exception (which the host would surface as 502)."""

    def _boom(*args, **kwargs):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(function_app, "classify_email", _boom)
    resp = function_app.classify_email_route(
        _make_request({"subject": "x", "body": "y"})
    )
    assert resp.status_code == 500
    data = json.loads(resp.get_body())
    assert data["issues"][0]["code"] == "internal_error"
