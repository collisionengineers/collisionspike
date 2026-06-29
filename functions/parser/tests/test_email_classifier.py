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
)

_HERE = os.path.dirname(os.path.abspath(__file__))
# .../collisionspike/functions/parser/tests -> .../collisionspike
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_HERE)))
_CORPUS_DIR = os.path.join(_REPO_ROOT, "test-cases-and-data", "triage-corpus")
_LABELS = os.path.join(_CORPUS_DIR, "labels.json")


def _load_manifest() -> dict:
    with open(_LABELS, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _read_eml(rel_path: str) -> tuple[str, str, str, str]:
    """Parse a corpus .eml -> (subject, body, from_address, sender_domain)."""
    path = os.path.join(_CORPUS_DIR, *rel_path.split("/"))
    with open(path, "rb") as fh:
        msg = email.message_from_bytes(fh.read(), policy=email.policy.default)
    subject = msg["subject"] or ""
    from_address = msg["from"] or ""
    sender_domain = from_address.split("@")[-1].strip("> ") if "@" in from_address else ""
    if msg.is_multipart():
        body = "".join(
            part.get_content()
            for part in msg.walk()
            if part.get_content_type() in {"text/plain", "text/html"}
        )
    else:
        body = msg.get_content()
    return subject, body, from_address, sender_domain


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
        subject, body, from_address, sender_domain = _read_eml(entry["eml"])
        # Mirror the route: HTML-strip the body before scanning.
        plain_body = function_app._strip_html(body)
        request = {
            "subject": subject,
            "body": plain_body,
            "from_address": from_address,
            "sender_domain": sender_domain,
            "provider_match_state": entry["provider_match_state"],
            "has_attachments": entry["has_attachments"],
        }
        # attachment_kinds is optional in the manifest (most Tier-2 fixtures are
        # attachment-less). The collision fixtures that carry an image to exercise
        # Rule 0 / Rule 2 supply it explicitly.
        if "attachment_kinds" in entry:
            request["attachment_kinds"] = entry["attachment_kinds"]
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


def test_corpus_covers_all_six_subtypes():
    """The corpus must exercise every subtype so a regression in any one rule is
    visible (Tier 1 covers the two receiving-work provider subtypes; Tier 2 the
    rest)."""
    seen = {e["expected"]["subtype"] for e in _MANIFEST["tier_1_existing_cases"]}
    seen |= {e["expected"]["subtype"] for e in _MANIFEST["tier_2_synthetic"]}
    assert seen == {
        "existing_provider_instruction",
        "existing_provider_audit",
        "new_client_work",
        "query_existing_work",
        "query_new_enquiry",
        "other",
    }


# --------------------------------------------------------------------------- #
# Pure-function unit checks (independent of the corpus)                       #
# --------------------------------------------------------------------------- #
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
    """F1: an instruction-class attachment from an unknown provider whose body carries
    only a loose VRM-shaped token (a model code) and no work phrase / Case/PO must NOT
    mint a Case — a body VRM no longer corroborates. Abstains to other."""
    result = classify_email(
        subject="Special offer",
        body="Model X5 now 20% off — best deal this year.",
        provider_match_state="none",
        attachment_kinds=["instruction"],
        has_attachments=True,
    )
    assert result["category"] == "other"
    assert result["subtype"] == "other"
    assert "uncorroborated_instruction_doc" in result["signals"]
    assert result["body_vrm"]  # VRM-shaped token found, but did NOT promote


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


def test_reply_with_no_reference_and_no_query_keyword_abstains_to_other():
    """Conservative bound: a bare reply (RE: subject) with NO Case/PO, NO registration,
    NO query keyword and NO work phrase has nothing to propose a link on, so it abstains
    to ``other`` (safe for a human) rather than guessing query_existing_work. It still
    must NOT be receiving_work."""
    result = classify_email(
        subject="RE: your email",
        body="Thanks, noted.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "other"
    assert result["is_reply"] is True


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
