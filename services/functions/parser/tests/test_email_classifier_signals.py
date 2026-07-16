"""Signal, registration, reply, and acknowledgement classification rules."""


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
