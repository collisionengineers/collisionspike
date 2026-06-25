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


def test_images_with_provider_no_query_phrasing_still_receiving_work():
    """Guard against over-correction: an image + a known provider with NO query
    phrasing (and no work phrase) remains receiving_work — the abstain only
    applies when the email is phrased as a query."""
    result = classify_email(
        subject="Photos for you",
        body="Here are the photos as discussed.",
        provider_match_state="one",
        attachment_kinds=["image"],
        has_attachments=True,
    )
    assert result["category"] == "receiving_work"
    assert result["subtype"] == "existing_provider_instruction"
    assert result["signals"][-1] == "rule:images_with_work_signal"


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
