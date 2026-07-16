"""Focused classifier regressions and ticket-evidence checks."""


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

from evidence_resolver import load_evidence_manifest, resolve_evidence  # noqa: E402

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
    orchestration's open-case match can tell "update on an open case" from "fresh work"."""
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
    """TKT-043: with orchestration's open-case match resolved (``one``), the chaser routes to
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
    manifest = load_evidence_manifest()
    matches = sorted(
        usage for usage in manifest["usages"]
        if usage["owner"] == ticket_id and usage["originalPath"].lower().endswith(".eml")
    )
    if not matches:
        return None
    evidence_path = resolve_evidence(sha256=matches[0]["sha256"])
    with evidence_path.open("rb") as fh:
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
