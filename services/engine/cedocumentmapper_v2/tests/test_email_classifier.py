"""Tests for the deterministic inbound-email classifier (taxonomy v1 + v2).

The classifier (``cedocumentmapper_v2.rules.email_classifier.classify_email``) is a
PURE function -- keyword / phrase / regex only, no LLM, no network, no I/O -- so this
suite is plain unit tests with no fixture/corpus infrastructure (that lives on the
collisionspike consumer side, at ``test-cases-and-data/triage-corpus/``, parametrised
by ``functions/parser/tests/test_email_classifier.py``, which mirrors this engine
after a re-vendor).

Coverage:
  * Regression pins for every v1 lane, so the taxonomy-v2 change (below) cannot move
    a currently-correct v1 decision.
  * Taxonomy v2 -- cancellation (collisionspike TKT-041): highest precedence of every
    rule in the module; a named reference vs a bare VRM vs no hint at all vs an
    is_reply-only hint; trumping the instruction-doc promotion; NOT firing on an
    ordinary chaser; the cheap negation guard; thread-scoping (a cancellation phrase
    sitting only in a QUOTED older message must not fire).
  * Taxonomy v2 -- case_update (collisionspike TKT-034/043): a reference + new
    evidence with no query phrase; the images_received vs update_general subtype
    split; a report-shaped attachment staying query (Rule 4c keeps winning); a query
    phrase or missing evidence keeping the row out of case_update.
  * Every response carries ``taxonomy_version == 2``; ``contract_version`` is
    unchanged by the taxonomy bump.
"""

from __future__ import annotations

import pytest

from cedocumentmapper_v2.rules.email_classifier import (
    CONTRACT_VERSION,
    TAXONOMY_VERSION,
    classify_email,
)


# --------------------------------------------------------------------------- #
# Regression pins -- the v1 lanes must not move under the taxonomy-v2 change  #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "name,kwargs,expected_category,expected_subtype",
    [
        (
            "digest_to_case_summary",
            dict(
                subject="New inspection requests",
                body=(
                    "Please find attached a summary of the instructions sent "
                    "yesterday showing the status of the inspections."
                ),
                provider_match_state="one",
                attachment_kinds=["image", "instruction"],
                attachment_filenames=["0.png", "Instruction_Bundle_46203.pdf"],
                has_attachments=True,
            ),
            "non_actionable",
            "case_summary",
        ),
        (
            "invoice_to_billing_request",
            dict(
                subject="Your Ref: kbs26067",
                body="Good afternoon, please provide the invoice for the attached report.",
                provider_match_state="one",
                attachment_kinds=["image", "instruction"],
                attachment_filenames=["image001.png", "Engineer Report.pdf"],
                has_attachments=True,
            ),
            "billing",
            "billing_request",
        ),
        (
            "bare_ack_to_acknowledgement",
            dict(
                subject="RE: your email",
                body="Thanks Ed",
                provider_match_state="one",
                has_attachments=False,
            ),
            "non_actionable",
            "acknowledgement",
        ),
        (
            "report_chaser_reply_to_query_existing_work",
            dict(
                subject="RE: 30143 - claim reference",
                body=(
                    "Good morning\nPlease provide engineers report.\n\n"
                    "From: Info\nSent: Wednesday, June 24, 2026 3:44 PM\nTo: Engineers\n"
                    "Subject: 30143\n\nWe instruct you to inspect the vehicle and "
                    "prepare a report. Please inspect.\n"
                ),
                provider_match_state="one",
                attachment_kinds=["image"],
                attachment_filenames=["image003.jpg"],
                has_attachments=True,
                in_reply_to="<orig@mail>",
            ),
            "query",
            "query_existing_work",
        ),
        (
            "roadworthy_informal_to_receiving_work",
            dict(
                subject="(EREF5) RTA claim (Our Ref: HMA/46428/1, Vehicle: WN14XPZ)",
                body=(
                    "Triage Only Request. Please provide an initial assessment to "
                    "confirm if this vehicle is roadworthy and repairable."
                ),
                provider_match_state="one",
                attachment_kinds=["image"],
                attachment_filenames=["CLVDamage5-V1.jpg"],
                has_attachments=True,
            ),
            "receiving_work",
            "existing_provider_instruction",
        ),
    ],
)
def test_v1_lane_regression_pins(name, kwargs, expected_category, expected_subtype):
    result = classify_email(**kwargs)
    assert result["category"] == expected_category, (name, result["signals"])
    assert result["subtype"] == expected_subtype, (name, result["signals"])


def test_every_response_carries_taxonomy_version_2_and_unchanged_contract_version():
    result = classify_email(subject="hello", body="hello", has_attachments=False)
    assert result["taxonomy_version"] == TAXONOMY_VERSION == 2
    assert result["contract_version"] == CONTRACT_VERSION == "cedocumentmapper_v2.0_email_triage"


# --------------------------------------------------------------------------- #
# Taxonomy v2 -- cancellation (collisionspike TKT-041)                       #
# --------------------------------------------------------------------------- #
def test_cancellation_with_caseref_is_good_confidence():
    result = classify_email(
        subject="Claim cancelled - CCPY26050",
        body=(
            "Please be advised that this claim has been cancelled. No further "
            "action is required on this claim."
        ),
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "cancellation"
    assert result["subtype"] == "cancellation_notice"
    assert result["confidence"] == 0.8
    assert result["body_caseref"] == "CCPY26050"


def test_cancellation_with_vrm_only_is_weak_confidence():
    result = classify_email(
        subject="Cancellation",
        body="Please cancel this inspection for vehicle AB12 CDE.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "cancellation"
    assert result["subtype"] == "cancellation_notice"
    assert result["confidence"] == 0.6
    assert result["body_vrm"] == "AB12CDE"
    assert result["body_caseref"] == ""
    assert result["body_jobref"] == ""


def test_cancellation_with_no_hint_at_all_is_still_cancellation_weak():
    """A cancellation with no reference in it is still a cancellation -- the
    context-aware triage-policy layer (collisionspike Phase 2) decides the action,
    the classifier only reports what the text says."""
    result = classify_email(
        subject="Update",
        body="Please cancel this instruction, thank you.",
        provider_match_state="none",
        has_attachments=False,
    )
    assert result["category"] == "cancellation"
    assert result["subtype"] == "cancellation_notice"
    assert result["confidence"] == 0.6
    assert result["body_caseref"] == result["body_vrm"] == result["body_jobref"] == ""
    assert result["is_reply"] is False


def test_cancellation_reply_only_hint_is_weak_confidence():
    """A reply that cancels but names no ref/jobref/VRM at all still only earns the
    WEAK band -- ``is_reply`` alone is not enough for GOOD."""
    result = classify_email(
        subject="RE: Engineer Instruction",
        body="Apologies, but we have cancelled this claim at our end.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "cancellation"
    assert result["is_reply"] is True
    assert result["body_caseref"] == result["body_jobref"] == ""
    assert result["confidence"] == 0.6


def test_cancellation_trumps_instruction_doc_promotion():
    """Real eval item tkt041-07: a FORWARDED "please close this one off" email with
    the ORIGINAL instructions quoted below it -- an attached instruction doc, a
    known provider, which would otherwise promote strongly at Rule 1 -- must
    classify cancellation, never receiving_work. Cancellation is checked before the
    instruction-doc promotion for exactly this reason."""
    result = classify_email(
        subject="FW: New Instruction - CCPY26050",
        body=(
            "Please close this one off - client has cancelled instructions.\n\n"
            "From: Sender Name\nSent: 10 June 2026 13:05\n"
            "To: Engineers <engineers@example.co.uk>\nSubject: New Instruction - CCPY26050\n\n"
            "Please inspect the vehicle and prepare a report."
        ),
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["instruction-form.pdf"],
        has_attachments=True,
    )
    assert result["category"] == "cancellation"
    assert result["subtype"] == "cancellation_notice"
    assert result["confidence"] == 0.8  # CCPY26050 (quoted subject) corroborates
    assert result["signals"][-1] == "rule:cancellation_notice"


def test_cancellation_does_not_fire_on_an_ordinary_chaser():
    """A normal "any update on our client's report" chase must NOT be swept into
    cancellation -- the phrase list is anchored to cancel/close/withdraw wording,
    not generic chase language."""
    result = classify_email(
        subject="RE: our client",
        body="Please can you advise — any update on our client's report?",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


def test_cancellation_negation_guard_suppresses_a_bare_not_cancelled():
    result = classify_email(
        subject="RE: our client",
        body=(
            "Please can you advise — any update on our client's report? "
            "This has not been cancelled, please proceed."
        ),
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] != "cancellation"
    assert "cancellation_negated" in result["signals"]


def test_cancellation_does_not_fire_on_a_quoted_older_cancellation():
    """Thread-scoping (collisionspike #3 / TKT-041): a cancellation phrase sitting
    only in a QUOTED older message must not cancel a DIFFERENT, currently-live
    thread -- only the sender's own newly-written text counts."""
    result = classify_email(
        subject="RE: CCPY26050",
        body=(
            "Please also inspect the vehicle again and confirm the new damage.\n\n"
            "-----Original Message-----\n"
            "Please cancel this instruction, it is no longer required.\n"
        ),
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] != "cancellation"


# --------------------------------------------------------------------------- #
# Taxonomy v2 -- case_update (collisionspike TKT-034/043)                    #
# --------------------------------------------------------------------------- #
# NOTE on scenario shape: Rule 4b alone (unchanged, "any REPLY naming a reference
# that is not a bare acknowledgement" -> query_existing_work) already claims almost
# every reply that names a reference, regardless of attachments. And a FRESH
# (non-reply) email carrying a formal body_caseref is, by the EXISTING/unchanged
# Rule 1 or Rule 2, already promoted to receiving_work the moment it also carries an
# instruction- or image-kind attachment (both rules treat body_caseref as sufficient
# corroboration on their own). So case_update is -- deliberately, as a structural
# consequence of "insert after 4c, don't touch Rule 1/Rule 2/4b" -- mostly reached
# via a FRESH email whose only hint is the LOOSER body_jobref (Rule 1/Rule 2 do not
# treat body_jobref as corroboration), or via a fresh email whose attachment kind is
# outside both the instruction and image vocabularies (so neither Rule 1 nor Rule 2
# even considers it). These fixtures use exactly those reachable shapes rather than
# a contrived one.
def test_case_update_jobref_and_images_is_images_received_weak_confidence():
    result = classify_email(
        subject="Our ref 45391/1",
        body="Further photos attached for our ref 45391/1.",
        provider_match_state="none",
        attachment_kinds=["image"],
        attachment_filenames=["further-photo-1.jpg"],
        has_attachments=True,
    )
    assert result["category"] == "case_update"
    assert result["subtype"] == "images_received"
    assert result["confidence"] == 0.6
    assert result["body_caseref"] == ""
    assert result["body_jobref"] != ""
    assert result["is_reply"] is False


def test_case_update_caseref_and_other_attachment_is_update_general_good_confidence():
    """A formal Case/PO reference + a NEW, non-report, non-instruction, non-image
    attachment (a kind neither Rule 1 nor Rule 2 considers, e.g. a forwarded email
    or a spreadsheet) reaches case_update at the GOOD band."""
    result = classify_email(
        subject="Further paperwork - CCPY26050",
        body="Please find further paperwork attached for CCPY26050.",
        provider_match_state="one",
        attachment_kinds=["other"],
        attachment_filenames=["claim-notes.xlsx"],
        has_attachments=True,
    )
    assert result["category"] == "case_update"
    assert result["subtype"] == "update_general"
    assert result["confidence"] == 0.8
    assert result["body_caseref"] == "CCPY26050"


def test_case_update_jobref_and_other_attachment_is_update_general_weak_confidence():
    result = classify_email(
        subject="Further paperwork - our ref 45391/1",
        body="Please find further paperwork attached for our ref 45391/1.",
        provider_match_state="none",
        attachment_kinds=["other"],
        attachment_filenames=["claim-notes.xlsx"],
        has_attachments=True,
    )
    assert result["category"] == "case_update"
    assert result["subtype"] == "update_general"
    assert result["confidence"] == 0.6
    assert result["body_caseref"] == ""
    assert result["body_jobref"] != ""


def test_case_update_report_attachment_stays_query_existing_work():
    """Rule 4c must keep winning: a report-shaped attachment + a reference is a
    query about existing work, never case_update -- even with no query phrase and
    no attempt to steal Rule 4c's territory."""
    result = classify_email(
        subject="Attachment for CCPY26050",
        body="Please see attached for CCPY26050.",
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["Engineer Report.pdf"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


def test_case_update_with_query_phrase_stays_query():
    """A reference + new evidence + a QUESTION is still a query first -- the "no
    query phrase in sender scope" gate on case_update."""
    result = classify_email(
        subject="CCPY26050",
        body="Could you confirm receipt of the further photos attached?",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["further-photo-1.jpg"],
        has_attachments=True,
    )
    assert result["category"] == "query"
    assert result["subtype"] == "query_existing_work"


def test_case_update_requires_new_evidence_not_just_a_reference():
    """A bare reference with NO attachment is not case_update -- the "new
    evidence" gate must actually gate (this one falls through to the bare-ack
    acknowledgement rule instead)."""
    result = classify_email(
        subject="RE: CCPY26050",
        body="Thanks.",
        provider_match_state="one",
        has_attachments=False,
    )
    assert result["category"] != "case_update"
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"


def test_case_update_does_not_fire_on_a_bare_acknowledgement_reply():
    """TKT-038 regression: the real TKT-038 email is a reply whose sender-written
    text is ONLY "Thanks Ed" -- but it also carries several embedded SIGNATURE
    images and names a job ref in the (inherited) subject. The classifier cannot
    yet tell a signature logo from a genuine damage photo (that raster-floor typing
    is TKT-047), so a bare acknowledgement must stay non_actionable/acknowledgement
    -- not be misread as case_update -- exactly as Rule 4b already excludes bare
    acknowledgements from query_existing_work."""
    result = classify_email(
        subject="RE: Our Ref: 45391/1",
        body="Thanks Ed",
        provider_match_state="one",
        attachment_kinds=["image"],
        attachment_filenames=["image001.png", "image002.png"],
        has_attachments=True,
    )
    assert result["category"] == "non_actionable"
    assert result["subtype"] == "acknowledgement"
    assert result["is_reply"] is True


def test_case_update_is_a_text_level_proposal_only_never_auto_links():
    """The classifier is pure -- it cannot know whether CCPY26050 is actually an
    OPEN case. It only reports category/subtype/references; the open-case lookup
    is the triage-policy layer's job (ADR-0019)."""
    result = classify_email(
        subject="Further paperwork - CCPY26050",
        body="Please find further paperwork attached for CCPY26050.",
        provider_match_state="one",
        attachment_kinds=["other"],
        attachment_filenames=["claim-notes.xlsx"],
        has_attachments=True,
    )
    assert result["category"] == "case_update"
    assert set(result.keys()) >= {
        "category",
        "subtype",
        "confidence",
        "signals",
        "is_reply",
        "body_vrm",
        "body_caseref",
        "body_jobref",
        "contract_version",
        "taxonomy_version",
    }


# --------------------------------------------------------------------------- #
# open_case_ref_match context input (collisionspike TKT-043)                   #
# --------------------------------------------------------------------------- #
# A work-shaped chaser that DELIVERS evidence on a ref the flow has resolved to an
# ALREADY-OPEN case is a case UPDATE, not fresh work — but the pure text is genuinely
# work-shaped ("Engineers report is required on the following case: ...<PO>...", an
# instruction-kind PDF), so ONLY the flow's open-case match can tell them apart. The
# ``open_case_ref_match`` input carries that resolved context, exactly like
# ``provider_match_state`` (the classifier is told, never looks a Case up).
def _tkt043_chaser(**over):
    kw = dict(
        subject="RE: Ref:160404/GN14GBE/Nissan Qashqai Tekna - Chaser for engineers report",
        body=(
            "Engineers report is required on the following case:\n\n160404\n\n"
            "Un-Roadworthy\nGN14GBE\n"
        ),
        provider_match_state="one",
        attachment_kinds=["instruction"],
        attachment_filenames=["images - cvd.pdf"],
        has_attachments=True,
    )
    kw.update(over)
    return classify_email(**kw)


def test_tkt043_open_case_ref_match_routes_images_pdf_to_case_update():
    """TKT-043: with the flow's open-case match resolved (``one``), a work-shaped chaser
    that delivers a photos-in-a-PDF ("images - cvd.pdf") on an OPEN case is
    case_update/images_received — the filename tier of _delivered_images_only sees the
    photos PDF the extension-derived kind reads as 'instruction'."""
    result = _tkt043_chaser(open_case_ref_match="one")
    assert result["category"] == "case_update", result["signals"]
    assert result["subtype"] == "images_received"
    assert "open_case_ref_match:one" in result["signals"]


def test_tkt043_default_stays_fresh_work_when_no_open_case_signal():
    """Kill-switch: absent/``none`` open_case_ref_match leaves the label EXACTLY as today
    (the text is genuinely work-shaped) — the flip is driven only by the resolved
    open-case context, never a hard-coded per-sample pass."""
    assert _tkt043_chaser()["category"] == "receiving_work"
    assert _tkt043_chaser(open_case_ref_match="none")["category"] == "receiving_work"


def test_tkt043_open_case_ref_match_ambiguous_also_suppresses_fresh_work():
    """An ambiguous open-case match (the ref hit >1 open case) still means "belongs to an
    existing case, not fresh work" — suppressed into the case_update lane; the ACTION
    (which case) is the triage-policy layer's call, never the classifier's."""
    assert _tkt043_chaser(open_case_ref_match="ambiguous")["category"] == "case_update"
