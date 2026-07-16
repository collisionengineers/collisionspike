"""HTTP route contract tests for inbound-email classification."""


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
