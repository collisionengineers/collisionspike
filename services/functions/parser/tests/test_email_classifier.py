"""Corpus contract tests for deterministic inbound-email classification."""


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

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(_HERE))))
_CORPUS_DIR = os.path.join(_REPO_ROOT, "tests", "fixtures", "email", "triage")
_LABELS = os.path.join(_CORPUS_DIR, "labels.json")
_EVIDENCE_RESOLVER_DIR = os.path.join(_REPO_ROOT, "tests", "fixtures", "resolvers")
if _EVIDENCE_RESOLVER_DIR not in sys.path:
    sys.path.insert(0, _EVIDENCE_RESOLVER_DIR)

from evidence_resolver import resolve_evidence  # noqa: E402


def _load_manifest() -> dict:
    with open(_LABELS, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _read_eml(rel_path: str, evidence_sha256: str | None = None) -> tuple[str, str, str, str, str]:
    """Parse a corpus .eml -> subject, body, sender identity and recipient auth result."""
    direct_path = Path(_CORPUS_DIR, *rel_path.split("/"))
    evidence_path = direct_path if direct_path.is_file() else resolve_evidence(
        sha256=evidence_sha256,
    )
    with evidence_path.open("rb") as fh:
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
        subject, body, from_address, sender_domain, authentication_results = _read_eml(
            entry["eml"], entry.get("evidence_sha256")
        )
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
