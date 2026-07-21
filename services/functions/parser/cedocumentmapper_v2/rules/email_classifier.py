"""Deterministic inbound-email classifier (Phase 8, Phase A).

A single PURE function — :func:`classify_email` — that reads an inbound email's
already-decoded fields and returns the operator's triage label. It is the Python
engine behind the parser Function's ``POST /classify-email`` route (the strong
signals already live in :mod:`cedocumentmapper_v2.rules.engine`, so re-deriving
them elsewhere would duplicate and drift). No persistence, network, or LLM —
just the same keyword / phrase / regex matching the rest of the engine uses, so
it is trivially unit-testable.

Taxonomy (two stable, append-only code tables; see collisionspike ADR-0015 + the
Phase-2 rules-engine-v2 plan). This block documents the CURRENT taxonomy — v1
(receiving_work/query/other, six subtypes) plus the ADDITIVE categories layered on
since: billing + non_actionable (three more subtypes), and now case_update +
cancellation (v2, three more subtypes). ``taxonomy_version`` in every response tells
a consumer which generation of codes a row was labelled at (existing rows keep their
v1/v1.1 codes — no backfill on a taxonomy bump):

    category  : receiving_work | query | billing | non_actionable | other
                | case_update | cancellation                        (v2, additive)
                | pre_instruction                                    (v3, additive)
                | website_enquiry                                    (v4, additive)
    subtype   : existing_provider_instruction   (RECEIVING WORK · base instruction)
                existing_provider_audit          (RECEIVING WORK · audit re-inspection)
                new_client_work                  (RECEIVING WORK · new client)
                query_existing_work              (QUERIES · about work we did)
                query_new_enquiry                (QUERIES · new enquiry / quote)
                billing_request                  (BILLING · invoice / fee chase)
                case_summary                      (NON_ACTIONABLE · recap digest)
                acknowledgement                    (NON_ACTIONABLE · bare "thanks")
                other                             (unidentified — the catch-all)
                images_received                    (CASE_UPDATE · v2 · images-only new evidence)
                update_general                      (CASE_UPDATE · v2 · other new evidence)
                cancellation_notice                (CANCELLATION · v2 · claim/instruction called off)
                payment_remittance                 (BILLING · v3 · inbound payment notification)
                pre_instruction_directions          (PRE_INSTRUCTION · v3 · held directions)
                website_general_enquiry              (WEBSITE ENQUIRY · v4 · contact form)

Guiding bias — **abstain to ``other``.** A forwarded chain, a signature, an
out-of-office reply or a bounce can throw a stray keyword or registration-shaped
token. Rather than risk a wrong receiving-work label (which would create or touch
a Case it should not), an email that does not clearly clear a rule falls through
to ``other`` for a human to look at. There is deliberately NO drop-junk
pre-filter: spam, newsletters and auto-replies are simply categorised as
``other``, never silently dropped.

What the classifier can and cannot see
--------------------------------------
The classifier is pure, so the open-Case lookup (does this Case/PO or VRM hit an
OPEN Case with no instruction doc?) belongs to the orchestration service, exactly
as the open question of "which Case does this belong to" stays out of ``/parse``.
The classifier surfaces ``body_caseref`` and ``body_vrm`` so orchestration can run
that case lookup and, on a match, keep the ``query_existing_work`` label
the classifier already proposes. The classifier NEVER auto-links and NEVER
guesses a Case — it only reports what it found in the text.

Replies / queries-on-existing-work (collisionspike #3)
------------------------------------------------------
A REPLY about work we are already doing (a chase for more assessment photos on a
submitted case, a client question after our report went out, with our own report
re-attached) looks like fresh work — a known provider plus an attachment — and
would otherwise be promoted to ``receiving_work`` and mint a DUPLICATE Case. The
classifier therefore derives an ``is_reply`` signal (from the In-Reply-To /
References threading headers when the caller passes them, else a leading ``RE:``
subject prefix; a ``FW:``/``FWD:`` forward is NOT a reply — it may carry a
genuinely new instruction onward). A reply with NO new work language is treated as
about-existing and suppressed out of the receiving-work rules into
``query_existing_work`` — but a reply that DOES carry a work phrase (a provider
replying "and here's the next job") still promotes, so precision stays high. The
classifier only reports ``is_reply`` + ``body_caseref`` / ``body_vrm``; the
EXISTING-Case lookup / linking stays on the orchestrator side (it alone can tell a
freshly-minted Case/PO from one quoted out of the reply thread).

Request fields (all optional; missing ones are treated as empty/absent):

    subject               the email subject line (plain text)
    body                  the email body, ALREADY html-stripped to plain text
    from_address          the sender's email address (informational)
    sender_domain         the sender's domain
    authentication_results  recipient-stamped Authentication-Results header
    provider_match_state  one | none | ambiguous  (orchestration's domain match result)
    attachment_kinds      list of attachment kinds, e.g. ["instruction", "image"]
    has_attachments       bool
    in_reply_to           the RFC-5322 In-Reply-To header, if the caller passes it
    references            the RFC-5322 References header, if the caller passes it
    open_case_ref_match   one | none | ambiguous  (orchestration's OPEN-CASE match result —
                          did the email's named Case/PO / job ref hit an already-open
                          Case?). Like ``provider_match_state`` this is an
                          orchestration-resolved context signal the classifier is TOLD,
                          never a lookup it makes itself (the open-Case query remains
                          workflow-service-owned, per
                          ADR-0019). Default absent = ``none`` = "not matched / not
                          resolved". When it is ``one``/``ambiguous`` — the ref names an
                          OPEN case — a work-shaped delivery on that ref is an UPDATE to
                          the existing case, not fresh work, so the fresh-work promotion
                          (Rules 1-3) is suppressed and it routes into the case_update
                          lane (TKT-043). The definitive open-case ACTION (attach /
                          suggest) is still the context-aware triage-policy layer's
                          (@cs/domain ``decideTriage``); this input lets the classifier
                          PROPOSE the same label when orchestration has already resolved the
                          match (the eval harness feeds it exactly as it feeds
                          ``provider_match_state``).

Response (a plain dict, JSON-serialisable):

    category          str   one of the categories above
    subtype           str   one of the subtypes above
    confidence        float 0.0–1.0, coarse banding (see _CONFIDENCE_*)
    signals           list  the exact rule ids / phrases that fired (explainable)
    is_reply          bool  the email is a reply in an existing thread (not a forward)
    body_vrm          str   first VRM found in subject+body, or ""
    body_caseref      str   first Case/PO found in subject+body, or ""
    body_jobref       str   first existing-job reference found in subject+body, or ""
    contract_version  str   the engine contract tag (unchanged by the taxonomy bump)
    taxonomy_version  int   the taxonomy generation this row was labelled at (4)
"""

from __future__ import annotations

from email.utils import parseaddr
import re
from typing import Any

from cedocumentmapper_v2.rules.engine import (
    POSTCODE_AREAS,
    VRM_CONTEXT_WORDS,
    VRM_CONTEXT_WINDOW,
    VRM_TIGHT_ANCHOR_RE,
    VRM_TIGHT_ANCHOR_WINDOW,
    detect_audit_signals,
    loose_alpha_head_is_postcode_area,
    reference_candidate_is_money,
    vrm_candidate_is_bad,
    wellformed_trigram_is_stopword,
    _match_keywords,
    _WORK_KEYWORDS,
    _QUERY_KEYWORDS,
    _BILLING_KEYWORDS,
    _INFORMAL_WORK_KEYWORDS,
    _CHASE_PHRASES,
    _SUMMARY_MARKERS,
    _CANCELLATION_PHRASES,
    _PAYMENT_PHRASES,
    _PRE_INSTRUCTION_PHRASES,
)
from cedocumentmapper_v2.rules.triage_rules import load_triage_rules

# Externalized phrase data (collisionspike rules-engine-v2 plan, Phase 5) -- see
# the matching comment in rules/engine.py. This module's OWN two collections
# (_AUTO_REPLY_MARKERS, _VRM_STOPWORD_TRIGRAMS below) are also sourced from the
# same schema-validated resources/triage-rules.json; the rest of this module's
# constants above were imported already loader-derived from engine.py.
_RULES = load_triage_rules()

# Contract tag for the classifier response. Kept distinct from the parser's EVA
# contract tag so a consumer can tell a /classify-email envelope apart from a
# /parse envelope.
CONTRACT_VERSION = "cedocumentmapper_v2.0_email_triage"

# Category constants. The original three (receiving_work | query | other) are
# joined by two ADDITIVE top-level categories (collisionspike TKT-029/037/038):
#   * billing         — a request for / chase of an invoice or fee for work we did
#   * non_actionable  — a case-summary digest, a bare acknowledgement ("Thanks Ed"),
#                       nothing to action (distinct from `other`, which is genuinely
#                       unidentified). Auto-reply/bounce still abstains to `other`.
# The Enquiries-vs-Case-Queries split (TKT-034) is carried by the two query subtypes
# (query_new_enquiry = Enquiries, query_existing_work = Case Queries), surfaced in the
# inbox; `query` stays the umbrella category so existing rows/contracts hold.
CATEGORY_RECEIVING_WORK = "receiving_work"
CATEGORY_QUERY = "query"
CATEGORY_BILLING = "billing"
CATEGORY_NON_ACTIONABLE = "non_actionable"
CATEGORY_OTHER = "other"
# Taxonomy v2 (collisionspike rules-engine-v2 plan, Phase 2) — two more ADDITIVE
# top-level categories:
#   * case_update   — new evidence (typically images, or another non-report
#                     attachment) arriving against a job the sender's text already
#                     names (a Case/PO or a looser job ref). TEXT-LEVEL PROPOSAL
#                     ONLY: the classifier cannot see whether that ref matches an
#                     OPEN case — the context-aware triage-policy layer (@cs/domain)
#                     makes the real call; this is just what the text + attachments
#                     show.
#   * cancellation  — the sender is calling off an existing instruction, claim or
#                     inspection outright (collisionspike TKT-041). Highest
#                     precedence of every rule in this module: it is checked before
#                     the instruction-doc promotion (Rule 1), so a forwarded
#                     "please close this off" with the original instructions
#                     quoted/attached below it still classifies cancellation, not
#                     receiving_work.
CATEGORY_CASE_UPDATE = "case_update"
CATEGORY_CANCELLATION = "cancellation"
# Taxonomy v3 (collisionspike TKT-084) — one more ADDITIVE top-level category:
#   * pre_instruction — the sender is giving us DIRECTIONS to follow when the
#                       official instruction later arrives ("when you receive an
#                       instruction from RJ please hold off obtaining images").
#                       Not yet an instruction (NO case may be minted), not noise
#                       (the directions must be held and surfaced on the case the
#                       later instruction mints — the workflow service's correlation
#                       job, gated TRIAGE_PRE_INSTRUCTION_ENABLED). The classifier
#                       only proposes the label; the workflow service owns holding
#                       and correlation.
CATEGORY_PRE_INSTRUCTION = "pre_instruction"
# Taxonomy v4 (TKT-170): a prospective customer using CE's website contact form.
# The transport sender is CE infrastructure, but the business sender is the visitor;
# this lane is deliberately non-minting and cannot update an existing case.
CATEGORY_WEBSITE_ENQUIRY = "website_enquiry"

# Subtype constants.
SUBTYPE_EXISTING_PROVIDER_INSTRUCTION = "existing_provider_instruction"
SUBTYPE_EXISTING_PROVIDER_AUDIT = "existing_provider_audit"
SUBTYPE_NEW_CLIENT_WORK = "new_client_work"
SUBTYPE_QUERY_EXISTING_WORK = "query_existing_work"
SUBTYPE_QUERY_NEW_ENQUIRY = "query_new_enquiry"
SUBTYPE_BILLING_REQUEST = "billing_request"
SUBTYPE_CASE_SUMMARY = "case_summary"
SUBTYPE_ACKNOWLEDGEMENT = "acknowledgement"
SUBTYPE_OTHER = "other"
# Taxonomy v2 subtypes.
SUBTYPE_IMAGES_RECEIVED = "images_received"      # CASE_UPDATE · attachments are images-only
SUBTYPE_UPDATE_GENERAL = "update_general"        # CASE_UPDATE · any other new evidence
SUBTYPE_CANCELLATION_NOTICE = "cancellation_notice"  # CANCELLATION · the only subtype today
# Taxonomy v3 subtypes (collisionspike TKT-105/TKT-084).
SUBTYPE_PAYMENT_REMITTANCE = "payment_remittance"    # BILLING · inbound payment notification
SUBTYPE_PRE_INSTRUCTION_DIRECTIONS = "pre_instruction_directions"  # PRE_INSTRUCTION · held directions
SUBTYPE_WEBSITE_GENERAL_ENQUIRY = "website_general_enquiry"  # WEBSITE_ENQUIRY · website contact form

# Response envelope taxonomy generation. Bumped only when a category/subtype is
# ADDED (never on a wording/confidence tweak) so a consumer (SPA filters, the
# eval-corpus scorer, the DDL code tables) can tell which codes a row may carry.
# Existing rows keep their old-generation codes — no backfill.
# v4 (TKT-170): + website_enquiry · website_general_enquiry.
TAXONOMY_VERSION = 4

# Website contact-form fingerprint (TKT-170). Trust is intentionally multi-signal:
# the exact infrastructure sender/domain AND at least two independent form markers.
# A display name, one copied phrase or a similar external email cannot claim the lane.
_WEBSITE_FORM_ADDRESS = "mail@noreply.collisionengineers.co.uk"
_WEBSITE_FORM_DOMAIN = "noreply.collisionengineers.co.uk"
_WEBSITE_FORM_SUBJECT_RE = re.compile(r"^\s*new\s+general\s+enquiry\s*[-:]", re.IGNORECASE)
_WEBSITE_FORM_HEADING_RE = re.compile(r"\bgeneral\s+enquiry\s+from\s+the\s+website\b", re.IGNORECASE)
_WEBSITE_FORM_FOOTER_RE = re.compile(
    r"\bsubmitted\s+via\s+the\s+collision\s+engineers\s+website\s+contact\s+form\b",
    re.IGNORECASE,
)
_WEBSITE_FORM_DMARC_PASS_RE = re.compile(
    r"\bdmarc=pass\b[^;]*\bheader\.from=noreply\.collisionengineers\.co\.uk(?=\s|;|$)",
    re.IGNORECASE,
)
_WEBSITE_FORM_COMPAUTH_PASS_RE = re.compile(r"\bcompauth=pass\b", re.IGNORECASE)

# Provider-match states orchestration passes in (a known provider domain matched
# exactly one / none / more than one row).
PROVIDER_ONE = "one"
PROVIDER_NONE = "none"
PROVIDER_AMBIGUOUS = "ambiguous"

# Attachment kinds that count as a strong work signal (an instruction document
# is the single strongest signal; mirrors classify-persist's Compose_kind).
_INSTRUCTION_KINDS = frozenset({"instruction", "instruction_doc", "claim_form"})
_IMAGE_KINDS = frozenset({"image", "images", "photo", "photos"})

# Coarse confidence bands so the later gated LLM pass can target only the
# low-confidence / other rows without re-deriving a score.
_CONFIDENCE_STRONG = 0.95   # instruction doc / explicit audit
_CONFIDENCE_GOOD = 0.8      # provider + work signal, or a clear query
_CONFIDENCE_WEAK = 0.6      # typed-in-body work, enquiry-only
_CONFIDENCE_ABSTAIN = 0.3   # fell through to other

# Case/PO matcher. The Case/PO is a Principal code (2-5 letters) + 2-digit year +
# a 3-to-4-digit provider case number, optionally carrying a case-type marker
# prefix -- "A." audit / "AP." total-loss audit / "D." diminution (ADR-0021;
# the alternation is longest-first so "AP." is never half-read as "A.").
# The real corpus splits two ways and the pattern mirrors it exactly:
#   * a 2-letter Principal always carries a 3-digit sequence  -> 5 trailing digits
#     ("MP26071", "AX26353", "FW26251");
#   * a 3-5-letter Principal carries a 3-OR-4-digit sequence   -> 5-6 trailing digits
#     ("CCPY26050", "ALS26066", "A.PCH261269", "QDOS261253").
# Anchoring the 2-letter arm to exactly 5 digits is what excludes a stray 6-digit
# token like "AB123456" (2 letters + 6 digits) while still admitting the genuine
# 6-digit refs (which all have >=3 letters). NOT a bare alphanumeric run, so a phone
# number, postcode, or VAT number in the body cannot masquerade as a Case/PO.
# Case-insensitive; tolerates an optional space after the marker dot.
#
# The trailing ``(?!\.\d)`` guard (collisionspike P1-4a) stops a SOLICITOR reference
# whose head happens to be Case/PO-shaped but which carries a dotted sequence suffix
# ("RTA135983.001", "RTA135600.001") from being mis-read as a CE-minted Case/PO by
# truncating its ".001" — inbound mail essentially NEVER contains a CE Case/PO, so a
# token immediately followed by ".<digit>" is routed to ``_job_reference`` (the
# about-existing signal) instead, which captures the whole dotted ref. A genuine CE
# Case/PO ("CCPY26050", "A.PCH261269") is never followed by a dotted digit, so it is
# unaffected.
CASEREF_RE = re.compile(
    r"\b(?:(?:AP|A|D)\.\s?)?(?:[A-Z]{2}\d{2}\d{3}|[A-Z]{3,5}\d{2}\d{3,4})\b(?!\.\d)",
    re.IGNORECASE,
)

# --- Existing-job reference extractor (collisionspike TKT-031/037/039/040) --- #
# Real existing-job references do NOT all match the strict Case/PO shape above:
# providers quote "Our Ref 575689", "your ref 45391_1", "SAB_46286_1", "206848.001".
# These are too loose to MINT a new Case (a phone number or quote number is the same
# shape), so they are surfaced as an ABOUT-EXISTING signal + a linkReply hint ONLY —
# never as new-client promotion corroboration (Rule 1/2/3 still require body_caseref).
#
#  (1) Labelled: an explicit "our/your ref" / "ref" / "claim" / "id" label immediately
#      followed by an alphanumeric token (the LABEL is what makes a bare number safe).
#      The token may use '/', '_', '.' or '-' separators ("SAB/46286/1", "206848.001").
#      "id" is included (collisionspike P1-4c) so "Bodyshop ID: 55837" captures — the
#      leading \b keeps it from firing mid-word ("valid", "considered"), and the
#      digit-required guard in _job_reference drops any non-numeric catch.
_LABELLED_REF_RE = re.compile(
    r"\b(?:our\s+ref(?:erence)?|your\s+ref(?:erence)?|ref(?:erence)?|claim(?:\s+no)?|id(?:\s+no)?)"
    r"\s*[:.\-#]?\s*"
    r"([A-Z0-9][A-Z0-9_./-]{2,})",
    re.IGNORECASE,
)
#  (2) Structured client ref: an alphanumeric token with a '/', '_' or '.' separator
#      and a digit run — "SAB/46286/1", "45391_1", "206848.001". Anchored to >=2
#      segments so a normal word or a plain number is excluded. The third alternative
#      (collisionspike P1-4b) allows ONE space between an ALL-CAPS principal code and a
#      3-4 digit sequence so a space-separated ref ("PHA 5013") captures; the
#      case-sensitive ``(?-i:...)`` group keeps title-case address words ("Suite 303",
#      "Unit 189") out while the outer flag stays case-insensitive for the rest.
_STRUCTURED_REF_RE = re.compile(
    r"\b([A-Z]{0,5}\d{3,}(?:[_./]\d{1,4}){1,3}"
    r"|[A-Z]{2,5}[_/]\d{3,}(?:[_/]\d{1,4})*"
    r"|(?-i:[A-Z]{2,5})\s\d{3,4})\b",
    re.IGNORECASE,
)
#  (3) Money guard (collisionspike TKT-103): a currency amount is exactly the
#      structured shape above ("768.00" = digits + '.' + digits), so the Tractable
#      "AI Quote: £768.00" surfaced as the job reference. A token whose dotted tail
#      is exactly TWO decimal digits is a money value, never a ref (every real
#      dotted ref in the corpus carries a 1- or 3-4-digit sequence suffix —
#      "206848.001", "45391_1" — never .NN). Comma-grouped thousands included.
#      The canonical definition now lives in rules/engine.py
#      (``reference_candidate_is_money`` — shared with the /parse
#      ``_fallback_reference`` tiers per TKT-136, so the two guards cannot drift).


def _job_reference(text: str) -> str:
    """First existing-job reference (labelled "our ref N" or structured "SAB/46286/1"),
    uppercased / whitespace-stripped, or "". Distinct from CASEREF_RE: an ABOUT-EXISTING
    signal + linkReply hint only — too loose to mint a new Case, so it never feeds the
    new-client promotion arms. A labelled token must contain a digit (so "ref: see below"
    is not mistaken for a reference). A MONEY value ("£768.00", "1,234.56") is never a
    reference — TKT-103's Tractable estimate figures matched the structured shape."""
    if not text:
        return ""

    def _is_money(token: str, start: int) -> bool:
        # Shared with the /parse fallback-reference guard (engine.py, TKT-136);
        # the ~8-char lookbehind window is unchanged TKT-103 behaviour.
        return reference_candidate_is_money(token, text[max(0, start - 8):start])

    # Labelled tier ITERATES (collisionspike C4) so a money value in an earlier
    # labelled match ("Ref: 768.00") cannot mask a genuine labelled ref later on
    # ("Our Ref: 12345") — mirrors the structured tier's finditer just below.
    for m in _LABELLED_REF_RE.finditer(text):
        if re.search(r"\d", m.group(1)) and not _is_money(m.group(1), m.start(1)):
            return re.sub(r"\s+", "", m.group(1)).upper()
    # Structured tier ITERATES so a money token earlier in the body ("£768.00")
    # cannot mask a genuine structured ref later on.
    for m in _STRUCTURED_REF_RE.finditer(text):
        if not _is_money(m.group(1), m.start(1)):
            return re.sub(r"\s+", "", m.group(1)).upper()
    return ""


# --- Report-attachment heuristic (collisionspike TKT-037/039) ---------------- #
# A Collision Engineers REPORT pdf is an EXISTING-work artefact (our own report sent
# back, or a third-party report sent for support/justification) — NOT an inbound
# instruction. But classification.ts maps every .pdf/.doc/.docx -> 'instruction', so
# the only reliable discriminator is the FILENAME. Matched against each filename after
# stripping spaces/_/- so "Engineer Report.pdf", "EngineersReport-V1.pdf", "report-v3"
# and "...Report.pdf" all hit. Anchored to "report" with an engineer/version/qualifier
# so a generic "report" word in prose is not enough.
_REPORT_FILENAME_RE = re.compile(
    r"(engineer'?s?report"          # engineerreport / engineersreport / engineer'sreport
    r"|reportv\d"                   # report-v2 / report v3 / reportv1
    r"|report\.(?:pdf|docx?)$"      # ...report.pdf / ...report.doc(x)  (report at end of stem)
    r"|finalreport|draftreport|auditreport)",
    re.IGNORECASE,
)


def _has_report_attachment(filenames: Any) -> bool:
    """True when any attachment filename looks like an engineer's REPORT (existing-work
    artefact), so it must not trip the Rule 1 new-case promotion (TKT-037/039)."""
    for fn in filenames or []:
        compact = re.sub(r"[\s_\-]+", "", str(fn)).lower()
        if _REPORT_FILENAME_RE.search(compact):
            return True
    return False


# --- New-image-evidence detector (collisionspike P1-5) ----------------------- #
# An inline signature/logo image rides in the HTML body as a cid: attachment and is
# almost always named "imageNNN.ext" (image001.png, image002.jpg ...). A GENUINE
# damage photo carries a real camera/app name (IMG_9108.jpeg, "WhatsApp Image ...",
# PHOTO-..., a GUID.jpg) or a filename that literally advertises images ("VD IMAGES
# pdf.pdf"). Distinguishing a signature logo from a damage photo by raster content is
# TKT-047 (out of scope); the filename is the most honest signal the classifier has
# today. Used ONLY to promote an image-delivering REPLY to case_update (Rule 4a2).
_SIGNATURE_IMAGE_RE = re.compile(r"^image0*\d{1,4}\.(?:png|jpe?g|gif|bmp)$", re.IGNORECASE)
_IMAGE_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "gif", "bmp", "heic", "webp", "tif", "tiff"})
_IMAGE_EVIDENCE_HINT_RE = re.compile(
    r"(?:images?|photos?|damage|\bimg[\W_]|vd\s*image)", re.IGNORECASE
)


def _is_image_evidence_file(fn: Any) -> bool:
    """True when ONE attachment filename looks like GENUINE image evidence — a damage
    photo, as opposed to an inline signature/logo or an engineer's REPORT. A real image
    extension (not the ``imageNNN.ext`` inline-signature pattern), or a filename that
    literally advertises images ("VD IMAGES pdf.pdf", "images - cvd.pdf"), counts; a
    signature logo or a report never does. The single-file predicate behind both
    :func:`_has_new_image_evidence` (ANY) and :func:`_delivered_images_only` (ALL)."""
    base = str(fn).strip()
    if not base or _SIGNATURE_IMAGE_RE.match(base) or _has_report_attachment([base]):
        return False
    ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
    return ext in _IMAGE_EXTENSIONS or bool(_IMAGE_EVIDENCE_HINT_RE.search(base))


def _has_new_image_evidence(filenames: Any) -> bool:
    """True when AT LEAST ONE attachment looks like GENUINE new image evidence — a
    damage photo delivered on a reply, as opposed to an inline signature/logo. Gate for
    promoting an image-delivering REPLY to case_update (Rule 4a2)."""
    return any(_is_image_evidence_file(fn) for fn in (filenames or []))


def _delivered_images_only(kinds: Any, filenames: Any) -> bool:
    """True when the NEW EVIDENCE delivered is photos and NOTHING else — the
    images_received-vs-update_general discriminator for the case_update rules (4a2/4d).

    Two ways in, so a photos-in-a-PDF is not mislabelled by the extension-derived kind:
      * by KIND — every attachment is an image kind (a set of real .jpg/.png photos); or
      * by FILENAME — every non-signature attachment is image evidence (an image
        extension OR a filename that advertises images, e.g. "images - cvd.pdf"), with
        NO engineer's report among them. The extension-derived attachment kind reads a
        photos PDF as ``instruction`` (P1-5's known filename-vs-content gap, TKT-047), so
        a chaser that delivers its damage photos AS a single "images ….pdf" would
        otherwise fall to ``update_general`` — the filename tier catches it (TKT-043).

    A report attachment ("…Engineers Report.pdf") is existing-work, never delivered
    evidence, so its presence disqualifies the images-only reading (mirrors Rule 4c /
    ``_has_new_image_evidence``'s own report exclusion). Kept in lockstep with the
    orchestrator's ``deriveAttachmentSignals`` imagesOnly so Stage A (this module) and
    Stage B (the triage-policy activity) never disagree about what an attachment IS."""
    # Drop signature/logo images (imageNNN.png) FIRST, then require ≥1 non-signature file
    # BEFORE the all-image KIND fast-path — a set made only of signature images (whose kind is
    # `image`) must not short-circuit to True (PR#45 / TKT-043 review; kept in lockstep with the
    # orchestrator's deriveAttachmentSignals.deliveredImagesOnly).
    kind_set = {str(k).strip().lower() for k in (kinds or []) if str(k).strip()}
    provided = [str(fn).strip() for fn in (filenames or []) if str(fn).strip()]
    if not provided:
        # The caller passed NO filenames at all (kinds-only request — the live
        # /classify-email contract allows this). The signature screen cannot run
        # without names, so fall back to the kind fast-path alone rather than
        # denying images_received outright (the PR#45 signature guard only
        # applies when filenames exist to screen).
        return bool(kind_set) and kind_set.issubset(_IMAGE_KINDS)
    non_signature = [fn for fn in provided if not _SIGNATURE_IMAGE_RE.match(fn)]
    if not non_signature:
        return False
    if _has_report_attachment(non_signature):
        return False
    if kind_set and kind_set.issubset(_IMAGE_KINDS):
        return True
    return all(_is_image_evidence_file(fn) for fn in non_signature)


# --- Bare-acknowledgement detector (collisionspike TKT-038, extended TKT-081) - #
# A reply whose SENDER-written message is only a short courtesy / confirmation ("Thanks
# Ed", "Good morning, thank you for this!", "Hi Ed, thank you — we'll wait to hear", an
# automated "thank you for your email", or a Teams "reacted to your message" notice) asks
# nothing and instructs nothing. It must NOT propose a query off an inherited-subject
# VRM/ref, nor mint a Case — it is no-action (-> non_actionable/acknowledgement). TKT-081:
# the live acks arrived wrapped in a greeting line, an automated-reply preamble, or a
# reaction notification, so keying on the raw FIRST line missed them; the detector now
# skips a leading greeting / auto-reply preamble and recognises the reaction notice. A
# question mark, a longer substantive line, or any work / query keyword still disqualifies
# it, so a courtesy that ALSO asks or instructs routes to the query / work rules (which
# run first).
_ACK_ONLY_RE = re.compile(
    r"^(?:thanks?|thank\s+you|many\s+thanks|thanks\s+(?:very\s+much|a\s+lot|again)|"
    r"no\s+problem|not\s+a\s+problem|no\s+worries|cheers|noted|"
    r"received(?:\s+with\s+thanks)?|great|perfect|brilliant|lovely|superb|fab|"
    r"ok(?:ay)?|got\s+it|much\s+appreciated|appreciated|understood|acknowledged|"
    r"will\s+do|that'?s?\s+(?:great|fine|perfect|brilliant|all|lovely)|all\s+good)\b",
    re.IGNORECASE,
)
# A greeting line ("Hi Ed", "Good morning,", "Dear Sirs") precedes the acknowledgement in
# real replies — skip it so the ack is found on the next line (TKT-081 s1/s4).
_GREETING_RE = re.compile(
    r"^(?:hi|hiya|hello|hey|dear|good\s+(?:morning|afternoon|evening|day)"
    r"|morning|afternoon|evening|greetings)\b",
    re.IGNORECASE,
)
# A Teams/Outlook "reaction" notification ("<name> reacted to your message:") delivers no
# instruction and asks nothing — a non-actionable acknowledgement (TKT-081 s3).
_REACTION_NOTICE_RE = re.compile(r"reacted to your message", re.IGNORECASE)
# A bare ack is SHORT. A terse greeting-LESS reply keeps the original tight bound (40) so
# a substantive one-liner ("Thank you, I have shared this with my client.") stays a linkable
# query. But once a GREETING or an automated-reply preamble has been skipped — the social
# marker of a courtesy note ("Hi Ed, thank you, we'll wait to hear back") — a slightly more
# generous bound (60) admits the trailing pleasantry clause (TKT-081 s4). The work/query
# keyword guard keeps a real request out either way.
_ACK_MAX_LEN = 40
_ACK_MAX_LEN_AFTER_GREETING = 60
_GREETING_MAX_LEN = 40


def _is_bare_acknowledgement(sender_text: str) -> bool:
    """True when the sender's message is only a short courtesy / confirmation — a reply
    that asks nothing and instructs nothing (TKT-038 "Thanks Ed"; TKT-081 "Good morning,
    thank you for this!", an automated "thank you for your email", a "reacted to your
    message" notice). A leading greeting or automated-reply preamble line is skipped so the
    acknowledgement is found even when it is not the raw first line, and a trailing email
    SIGNATURE never defeats it. A question mark, a longer substantive first sentence, or any
    work / query / chase keyword disqualifies it, so a courtesy that ALSO asks or instructs
    still routes to the query / work rules (which run before the acknowledgement rule)."""
    skipped_preamble = False
    for raw in (sender_text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        # A reaction notification is a bare ack outright.
        if _REACTION_NOTICE_RE.search(line):
            return True
        low = line.lower()
        # Skip a leading greeting or an automated-reply preamble; judge the first
        # substantive line the sender actually wrote (a skipped preamble relaxes the cap).
        if _GREETING_RE.match(line) and len(line) <= _GREETING_MAX_LEN:
            skipped_preamble = True
            continue
        if any(marker in low for marker in _AUTO_REPLY_MARKERS):
            skipped_preamble = True
            continue
        # Judge the first SENTENCE for the opener + length (an automated "Thank you for
        # your email. Our team will review it." leads with a short ack then boilerplate),
        # but keep the question / keyword guards on the WHOLE line so a courtesy that also
        # asks or instructs ("Thanks. Please inspect AB12 CDE.") is not swallowed.
        cap = _ACK_MAX_LEN_AFTER_GREETING if skipped_preamble else _ACK_MAX_LEN
        first_sentence = re.split(r"[.!?\n]", line, maxsplit=1)[0].strip()
        if "?" in line or len(first_sentence) > cap:
            return False
        if not _ACK_ONLY_RE.match(first_sentence):
            return False
        # A courtesy that also carries work / query language is a query or instruction,
        # not a bare ack — let the query / work rules handle it.
        if (
            _match_keywords(line, _WORK_KEYWORDS)
            or _match_keywords(line, _QUERY_KEYWORDS)
            or _match_keywords(line, _INFORMAL_WORK_KEYWORDS)
            or _match_keywords(line, _CHASE_PHRASES)
        ):
            return False
        return True
    return False


# --- "Your report" about-existing reference (collisionspike TKT-082) --------- #
# A possessive reference to OUR report ("your attached Engineers Report", "the hours
# quoted in your report") is an ABOUT-EXISTING signal — the sender is asking about work we
# already did, NOT instructing new work. It must neutralise the "engineers report" work
# keyword (which substring-matches "your ... Engineers Report") so a question about our
# report is not promoted to receiving_work / new_client_work (TKT-082 s1). A fresh
# instruction says "please provide AN engineer's report", never "YOUR report".
_OUR_REPORT_REFERENCE_RE = re.compile(
    r"\byour\s+(?:attached\s+)?(?:engineer'?s?\s+)?report\b",
    re.IGNORECASE,
)

# --- Canonical body_vrm matcher (collisionspike #7) -------------------------- #
# The inbox VRM chip is fed by ``body_vrm``. The engine's ``VRM_RE`` is
# deliberately LOOSE for /parse PDF-field extraction (guarded downstream), and its
# 4th, dateless alternative ``[A-Z]{1,3}\d{1,4}`` over-matches: live inboxes showed
# UK postcode outward codes (B8/LS8/G3/BD8) and security-mail junk (BOX2/AT8/LH3/
# ON26) surfaced AS VRMs. The classifier therefore uses a tighter, two-tier
# ruleset for ``body_vrm`` only — the loose /parse path is unchanged.
#
# Tier 1 — a WELL-FORMED UK VRM (current / prefix / suffix) is accepted outright:
#   * current/post-2001 : [A-Z]{2}\d{2} [A-Z]{3}   (MX17 PNL, AP70 WAA, AB12 CDE)
#   * prefix 1983-2001  : [A-Z]\d{1,3} [A-Z]{3}     (A123 BCD)
#   * suffix 1963-1983  : [A-Z]{3} \d{1,3}[A-Z]     (ABC 123D)
_VRM_WELLFORMED_RE = re.compile(
    r"\b(?!VAT\b)(?!TEL\b)(?!REF\b)("
    r"[A-Z]{2}\d{2}\s?[A-Z]{3}"
    r"|[A-Z]\d{1,3}\s?[A-Z]{3}"
    r"|[A-Z]{3}\s?\d{1,3}[A-Z]"
    r")\b",
    re.IGNORECASE,
)
# Tier 2 — the loose, dateless shape. It is admitted ONLY with a nearby VRM context
# word AND only when it clears the postcode / junk guards (see _canonical_body_vrm).
_VRM_LOOSE_RE = re.compile(
    r"\b(?!VAT\b)(?!TEL\b)(?!REF\b)([A-Z]{1,3}\s?\d{1,4})\b",
    re.IGNORECASE,
)
# Context words / windows, the TKT-071 TIGHT anchor, and the #7/F162 stop-word
# TRIGRAM guard are now defined canonically in rules/engine.py (TKT-136 ported
# them to the /parse DOCUMENT path too — see engine.vrm_document_candidate_is_bad);
# this module aliases them so the classifier and the engine cannot drift.
_VRM_CONTEXT_WORDS: tuple[str, ...] = VRM_CONTEXT_WORDS
_VRM_CONTEXT_WINDOW = VRM_CONTEXT_WINDOW
_VRM_TIGHT_ANCHOR_WINDOW = VRM_TIGHT_ANCHOR_WINDOW
_VRM_TIGHT_ANCHOR_RE = VRM_TIGHT_ANCHOR_RE
_loose_alpha_head_is_postcode_area = loose_alpha_head_is_postcode_area
_VRM_STOPWORD_TRIGRAMS: frozenset[str] = _RULES.vrm_stopword_trigrams
_wellformed_trigram_is_stopword = wellformed_trigram_is_stopword


def _canonical_body_vrm(text: str) -> str:
    """First well-formed UK VRM in ``text`` (uppercased, whitespace-stripped), or "".

    Tighter than the engine's ``VRM_RE`` so the inbox VRM chip never shows postcode
    outward codes or junk tokens (collisionspike #7). A well-formed VRM is accepted
    outright — UNLESS its 3-letter alpha group spells a common English stop-word and
    no VRM context word sits nearby (natural-language / model text such as "Model X5
    now …" matched the prefix alternative as "X5 NOW"; F162). A loose, dateless
    candidate is admitted only when a VRM context word sits nearby AND it clears
    ``vrm_candidate_is_bad`` — whose postcode guard is CANDIDATE-ANCHORED (is the
    candidate itself a postcode outward code?), mirroring the engine's /parse
    fallback, so an UNRELATED postcode elsewhere in the window no longer suppresses a
    valid loose reg (F209).
    """
    if not text:
        return ""
    lowered = text.lower()
    # Tier 1 — a well-formed VRM wins outright. Iterate (not just .search) so a
    # stop-word false positive ("X5 NOW") early in the text does not mask a real
    # plate later; a candidate whose alpha trigram is a stop-word is rejected ONLY
    # when no VRM context word sits nearby (a genuine "reg AB12 NEW" still passes).
    for m in _VRM_WELLFORMED_RE.finditer(text):
        candidate = m.group(1)
        if _wellformed_trigram_is_stopword(candidate):
            start = max(0, m.start() - _VRM_CONTEXT_WINDOW)
            end = m.end() + _VRM_CONTEXT_WINDOW
            if not any(word in lowered[start:end] for word in _VRM_CONTEXT_WORDS):
                continue  # stop-word trigram + no VRM context -> natural-language noise
        return re.sub(r"\s+", "", candidate).upper()
    # Tier 2 — a loose/dateless candidate must clear the junk / CANDIDATE-ANCHORED
    # postcode guard (``vrm_candidate_is_bad``) AND have a VRM context word nearby.
    # The postcode test is anchored to the candidate (is IT a postcode outward code,
    # i.e. immediately followed by an inward ``\d[A-Z]{2}``?) rather than a window-wide
    # scan, so a real loose reg survives an UNRELATED postcode nearby (F209 — e.g.
    # "reg AB1234 … Leeds LS8 2AB"). Iterate so a junk token early in the body does
    # not mask a real, context-anchored dateless plate later on.
    for m in _VRM_LOOSE_RE.finditer(text):
        candidate = m.group(1)
        start = max(0, m.start() - _VRM_CONTEXT_WINDOW)
        end = m.end() + _VRM_CONTEXT_WINDOW
        window = text[start:end]
        if vrm_candidate_is_bad(candidate, window):
            continue  # too short / postcode-outward / label word (B8, G3, BOX2, ...)
        # TKT-071: a candidate whose letter head is a UK postcode AREA (HD4110)
        # shares its shape with postcode fragments and provider job refs, so a
        # context word merely NEARBY does not license it — the anchor must
        # IMMEDIATELY precede it ("reg HD4110" accepted; "FW: HD4110 - LETTER OF
        # INSTRUCTION" with "vehicle" elsewhere rejected).
        if _loose_alpha_head_is_postcode_area(candidate):
            before = text[max(0, m.start() - _VRM_TIGHT_ANCHOR_WINDOW):m.start()]
            if not _VRM_TIGHT_ANCHOR_RE.search(before):
                continue
        elif not any(word in lowered[start:end] for word in _VRM_CONTEXT_WORDS):
            continue  # dateless shape with no "reg/registration/vrm/vehicle/plate"
        return re.sub(r"\s+", "", candidate).upper()
    return ""


# Out-of-office / automatic-reply / bounce markers. These do NOT drop the email
# (everything is categorised) — they bias an otherwise weak email firmly to
# ``other`` so an auto-reply that happens to quote a work phrase in its history is
# not mistaken for a fresh instruction.
_AUTO_REPLY_MARKERS: tuple[str, ...] = _RULES.auto_reply_markers


# --- Image-capture delivery service lane (collisionspike TKT-102) ------------ #
# Tractable is an app CE ITSELF commissions to obtain vehicle images: the client
# photographs the vehicle -> uploads to a portal -> the images + a summary PDF
# are emailed to CE ("New completed lead: Book <name> in today"). That email is
# an IMAGE DELIVERY onto a matter CE already knows about — never a work provider
# instructing new work (its PDF's extension-derived kind is "instruction", so
# without Rule 0f it would knock on Rule 1's door; pre-0f it abstained to
# ``other`` as an uncorroborated doc). Detection keys on DURABLE identity
# signals — the tractable.ai sender domain, or the "Powered by Tractable" footer
# when the mail was forwarded — corroborated by the completed-capture delivery
# wording ("completed lead", "damage capture"); deliberately NEVER the subject
# emoji. Identity alone does not fire (a Tractable support/billing email must
# not read as an image delivery). Routed to the EXISTING taxonomy lane
# case_update · images_received (the photos ride in the attached summary PDF;
# no taxonomy extension needed). The workflow service owns case matching, as with
# every other case_update proposal.
_IMAGE_SERVICE_SENDER_DOMAINS: tuple[str, ...] = _RULES.image_service_sender_domains
_IMAGE_SERVICE_IDENTITY_PHRASES: tuple[str, ...] = _RULES.image_service_identity_phrases
_IMAGE_SERVICE_DELIVERY_PHRASES: tuple[str, ...] = _RULES.image_service_delivery_phrases


def _sender_domain_matches(domain: str, service_domains: tuple[str, ...]) -> bool:
    """True when ``domain`` equals one of ``service_domains`` or is a subdomain
    of one (``mail.tractable.ai`` matches ``tractable.ai``; ``nottractable.ai``
    does not)."""
    d = (domain or "").strip().lower().rstrip(".")
    if not d:
        return False
    return any(
        d == s or d.endswith("." + s)
        for s in (str(item).strip().lower() for item in service_domains)
        if s
    )


def _normalise(value: Any) -> str:
    """Coerce a possibly-missing request field to a clean string."""
    if value is None:
        return ""
    return str(value)


def _first_match(pattern: re.Pattern[str], text: str) -> str:
    """Return the first whole match of ``pattern`` in ``text`` (uppercased,
    inner whitespace collapsed), or "" when there is none."""
    match = pattern.search(text)
    if not match:
        return ""
    return re.sub(r"\s+", "", match.group(0)).upper()


def _is_auto_reply(text: str) -> tuple[str, ...]:
    """Return the auto-reply / bounce markers present in ``text``."""
    if not text:
        return ()
    haystack = text.lower()
    return tuple(marker for marker in _AUTO_REPLY_MARKERS if marker in haystack)


# Reply vs forward subject prefixes (collisionspike #3). A leading ``RE:`` marks a
# reply (a message in an existing thread); ``FW:`` / ``FWD:`` marks a forward (an
# onward-send of someone else's mail). Anchored to the LEADING token with a required
# colon, so "Re-inspection" (no colon) is NOT a reply and a body that merely mentions
# "re:" cannot trip it. Only a reply trips the about-existing suppression below.
# A reply prefix is "RE"/"AW"/"SV" (intl), an OPTIONAL colon, then REQUIRED
# whitespace — real Outlook subjects do "RE: 30143 - ..." and "RE 30143 - ..." (no
# colon), TKT-030/031. Requiring whitespace after the prefix is the key discriminator
# (collisionspike P0-2): a provider CASE-SCHEME glued straight onto a bare colon with
# NO space ("Re:128086.001", "Re:127774.001", "Re:100875.003" — Robert James) is a
# structured reference in the subject, NOT a reply, and misreading it as one demoted a
# genuine fresh instruction to query_existing_work. "Re-inspection" (glued hyphen) and
# "Review" (next char a letter) still fail the whitespace requirement, so they are not
# replies. The remainder is captured so the structured-ref guard below can screen it.
# Forward longest-first ("fwd" before "fw") so "FWD:" is not mis-split. (#3 / TKT-031)
_REPLY_SUBJECT_RE = re.compile(r"^\s*(?:re|aw|sv):?\s+(\S.*)$", re.IGNORECASE)
_FORWARD_SUBJECT_RE = re.compile(r"^\s*(?:fwd|fw)(?::|\s)", re.IGNORECASE)
# A subject remainder that is NOTHING BUT a dotted structured reference — a bare
# "digits.digits" scheme or an "alpha-principal+digits.digits" token, with no real
# words after it — is a reference line, not a reply ("Re: 128086.001"). A genuine
# reply whose subject merely STARTS with a Case/PO but carries real words after it
# ("RE: CCPY26050 - your report") is UNAFFECTED (the trailing words fail the ``$``
# anchor), so header-less Case/PO replies still register. Only the dotted solicitor
# form is screened, so a bare CE Case/PO is never mistaken for a non-reply.
_SUBJECT_ONLY_REFERENCE_RE = re.compile(
    r"^(?:\d{3,}\.\d+|[A-Z]{2,5}\d{2,}\.\d+)$",
    re.IGNORECASE,
)


def _is_reply(subject: str, in_reply_to: str, references: str) -> bool:
    """Return True when the email is a REPLY in an existing thread (not a forward).

    Precedence (collisionspike #3, P0-2):
      * A forward (``FW:`` / ``FWD:`` subject) is NEVER a reply — it is an onward-send
        that may carry a genuinely NEW instruction, so it must not trip the
        about-existing suppression. Checked FIRST so a threading header riding on a
        forwarded chain is not misread as a reply.
      * The RFC-5322 threading headers ``In-Reply-To`` / ``References`` are the
        authoritative reply signal when the caller passes them (a well-behaved client
        sets them only on a reply). Stronger than the subject, so checked next — a
        genuine "RE: Ref: 506115" / "RE: RTA135983.001" reply that carries these
        headers stays a reply regardless of its subject shape.
      * Otherwise fall back to a leading ``RE:`` subject prefix — but ONLY when it is
        followed by whitespace AND the remainder is not just a dotted structured
        reference (the Robert James "Re:128086.001" case-scheme has neither: no space,
        a bare dotted ref). This is the signal available before the orchestrator wires
        the threading headers through.
    """
    if _FORWARD_SUBJECT_RE.match(subject):
        return False
    if in_reply_to.strip() or references.strip():
        return True
    match = _REPLY_SUBJECT_RE.match(subject)
    if not match:
        return False
    return not _SUBJECT_ONLY_REFERENCE_RE.match(match.group(1).strip())


# Markers that begin a QUOTED reply chain. Everything from such a marker onward (and
# any plain-text ``>``-prefixed line) is PRIOR thread text, not what THIS sender wrote.
# Used ONLY to decide whether a reply carries a NEW work phrase — the about-existing
# suppression discriminator (collisionspike #3, "no NEW work phrase beyond the quoted
# thread"): our own report cover note quoted back ("please find our engineer's report")
# must not read as the sender instructing fresh work. The FULL text is still scanned for
# the Case/PO + registration, so a reference quoted from the thread is still surfaced for
# the orchestrator's open-Case lookup.
_QUOTED_THREAD_MARKERS: tuple[str, ...] = (
    "-----original message-----",
    "----- original message -----",
    "------ original message ------",
    "________________________________",  # Outlook reply divider
)
# Gmail-style attribution line ("On <date>, <name> wrote:") that introduces a quote.
_GMAIL_QUOTE_RE = re.compile(r"^\s*On\b.*\bwrote:\s*$", re.IGNORECASE | re.MULTILINE)
# Outlook-style quoted-header block — a "From:" line followed by one or more of
# Sent/To/Cc/Subject/Date header lines. This is the MOST COMMON reply-quote convention
# in the corpus (Outlook on the provider side) and is NOT introduced by an
# "-----Original Message-----" divider, so it must be stripped explicitly or the quoted
# original instruction below it contaminates the sender-written scope (TKT-030/038).
# The follow-up header requirement keeps it precise (a sender writing "From: our notes"
# in prose won't match without the Sent/To/Subject cascade).
_OUTLOOK_HEADER_RE = re.compile(
    r"(?im)^[ \t]*from:[ \t]*\S.*(?:\r?\n[ \t]*(?:sent|to|cc|subject|date):[ \t]*.*){1,5}",
)


def _sender_written_text(text: str) -> str:
    """Return only the text THIS sender wrote — quoted reply-chain text removed.

    Conventions handled: an Outlook ``-----Original Message-----`` / underscore
    divider, the Gmail ``On <date>, <name> wrote:`` attribution, and plain-text
    ``>``-quoted lines. Everything from the earliest such marker onward is dropped.
    Best-effort and conservative — it only ever REMOVES text, so the worst case is
    that a quoted work phrase survives (no over-suppression of genuine new work).
    """
    if not text:
        return text
    lowered = text.lower()
    cut = len(text)
    for marker in _QUOTED_THREAD_MARKERS:
        idx = lowered.find(marker)
        if idx != -1:
            cut = min(cut, idx)
    gmail = _GMAIL_QUOTE_RE.search(text)
    if gmail:
        cut = min(cut, gmail.start())
    outlook = _OUTLOOK_HEADER_RE.search(text)
    if outlook:
        cut = min(cut, outlook.start())
    head = text[:cut]
    return "\n".join(line for line in head.splitlines() if not line.lstrip().startswith(">"))


# --- Cancellation negation guard (collisionspike TKT-041) -------------------- #
# Cheap and DELIBERATELY simple, per the taxonomy-v2 plan: reject a cancellation
# phrase hit when a negation word sits shortly (<=2 words) before a "cancel" stem in
# the SENDER-WRITTEN text — "this has NOT been cancelled", "we do not wish to
# cancel". Documented limits, not solved: it only guards the "cancel" /
# "cancelled" / "cancellation" stem — a negated NON-"cancel" phrase ("we are NOT
# closing this file", "it is NOT withdrawn") is not caught; a negation more than a
# couple of words before "cancel" is not caught either ("Please note that, contrary
# to what you may have heard elsewhere, this has not been cancelled" would slip
# through). Extend if real misses turn up.
_CANCELLATION_NEGATION_RE = re.compile(
    r"\b(?:not|never|n't|isn't|wasn't|won't|hasn't|hadn't|don't|doesn't|didn't)\b"
    r"(?:\s+\S+){0,2}\s+cancel",
    re.IGNORECASE,
)


def classify_email(
    subject: Any = "",
    body: Any = "",
    from_address: Any = "",
    sender_domain: Any = "",
    provider_match_state: Any = "",
    attachment_kinds: Any = None,
    has_attachments: Any = False,
    in_reply_to: Any = "",
    references: Any = "",
    attachment_filenames: Any = None,
    open_case_ref_match: Any = "",
    authentication_results: Any = "",
    attachment_content_typings: Any = None,
) -> dict[str, Any]:
    """Classify one inbound email into the triage taxonomy. PURE — no I/O.

    First-match-wins decision tree (see ADR-0015 / the Phase-8 plan; taxonomy v2 —
    cancellation + case_update — is the collisionspike rules-engine-v2 Phase-2 plan):

      0. Auto-reply / bounce marker present, AND no instruction doc -> other
         (abstain-to-other; a quoted OOO chain or a bounce must not read as
         work, even when it happens to carry an image — BUT an attached
         instruction doc is the module's strongest positive signal and overrides
         the abstain, so a real provider instruction whose footer says
          "do not reply" still reaches Rule 1).
      0a. (taxonomy v4) An authenticated Collision Engineers website contact form
          with the expected transport sender plus at least two independent form
          markers -> website_enquiry · website_general_enquiry. Checked before
          every case-related rule because visitor free text is never case evidence.
      0c. A cancellation phrase (SENDER-WRITTEN scope, not negated) -> cancellation ·
          cancellation_notice. HIGHEST PRECEDENCE of every rule below this point —
          checked before the instruction-doc promotion (Rule 1) so a forwarded
          "please close this off" with the original instructions quoted/attached
          below it still classifies cancellation, never receiving_work (TKT-041,
          eval item tkt041-07). Fires on the phrase alone — a case-existence hint
          (body_caseref / body_jobref / body_vrm / is_reply) only raises the
          confidence band, it is not a gate: a cancellation with no ref at all is
          still a cancellation (the context-aware triage-policy layer decides the
          action).
      0d. (taxonomy v3) An inbound-payment phrase (remittance advice / transfer
          notice, sender scope) -> billing · payment_remittance. Before Rule 1
          because the payment PDF's extension-derived kind is "instruction"
          (TKT-105/120).
      0e. (taxonomy v3) A pre-instruction phrase (directions for WHEN the later
          official instruction arrives) + an identifier, with NO instruction doc,
          <2 work phrases and no question -> pre_instruction ·
          pre_instruction_directions (TKT-084; no case minted — the workflow
          service holds + correlates, gated TRIAGE_PRE_INSTRUCTION_ENABLED).
      0f. (TKT-102) An image-capture service CE commissions (Tractable)
          delivering a completed capture — an identity anchor (tractable.ai
          sender domain / "powered by tractable") AND delivery wording
          ("completed lead" / "damage capture") -> case_update ·
          images_received. Before Rule 1 because the summary PDF's
          extension-derived kind is "instruction"; never receiving_work.
      1. Instruction doc attached (necessary but NOT sufficient — the kind is
         extension-derived), UNLESS the email is about EXISTING work — query-phrased
         OR a reply (``is_reply``) — with no NEW work language (suppressed -> falls
         through to the query rules; a reply that re-attaches our own prior report
         must not mint a duplicate Case):
           - known provider + audit -> receiving_work · existing_provider_audit
           - known provider          -> receiving_work · existing_provider_instruction
           - unknown provider CORROBORATED by a work phrase OR a body Case/PO
                                     -> receiving_work · new_client_work
           - otherwise NOT promoted: a bare PDF/DOC with no provider, no work
             language and no Case/PO (a spam flyer, invoice, statement, newsletter or
             forwarded letter) must not become a Case on the file extension alone.
             A body VRM does NOT corroborate (VRM_RE over-matches postcodes / models /
             years); audit phrases ALONE do not promote an unknown provider (no
             new-client-audit subtype). Flag ``uncorroborated_instruction_doc`` and
             fall through to the query / abstain rules.
      2. Images + (a work phrase OR a body Case/PO OR an audit signal from a KNOWN
         provider) -> receiving_work, UNLESS the email is about EXISTING work —
         phrased as a query OR a reply (``is_reply``) — with no work language (then
         fall through to the query rules — a provider chasing a report who re-attaches
         the original photo, or replying with further-assessment photos on a submitted
         case, must not create/touch a work Case).
         A known provider domain ALONE, a bare VRM, or an audit signal from an UNKNOWN
         provider do NOT promote a bare image (a forwarded chain, signature logo, or
         bounced-back photo all match the domain); a known provider only selects the
         subtype (and emits the audit subtype) once another signal corroborates.
      3. No attachment, >=2 work keywords + a body Case/PO or VRM -> receiving_work
         (an instruction typed into the email body).
      4. A query keyword OR a reply (``is_reply``) + a body Case/PO or VRM -> query /
         query_existing_work (orchestration confirms the open-Case link; the classifier
         proposes it — a reply naming a Case/PO or registration is about work we did).
      4d. (taxonomy v2) An existing-job reference (body_caseref/body_jobref, full
          haystack) + new evidence (a non-report attachment, or an image attachment
          kind) + NO query phrase in sender scope + NOT a bare-acknowledgement reply
          -> case_update · images_received/update_general. TEXT-LEVEL PROPOSAL ONLY
          (see the category docstring above). Checked AFTER Rules 4a/4b/4c so
          today's chaser/report/reply-with-reference handling keeps winning — in
          practice this rule is narrower than it first looks, since Rule 4b alone
          already claims almost every non-bare-ack REPLY that names a reference; it
          is mostly reached by a FRESH (non-reply) mention of an existing ref. The
          bare-acknowledgement exclusion mirrors Rule 4b/5b (TKT-038: "Thanks Ed" +
          embedded signature images must stay acknowledgement, not case_update).
      5. A query keyword, no Case/PO or VRM  -> query
         (query_existing_work if the sender is a known provider, else
         query_new_enquiry).
      6. Anything else                       -> other.
    """
    subject_s = _normalise(subject)
    body_s = _normalise(body)
    from_s = _normalise(from_address).strip().lower()
    domain_s = _normalise(sender_domain).strip().lower()
    authentication_s = _normalise(authentication_results).strip().lower()
    state = _normalise(provider_match_state).strip().lower()
    # Orchestration's OPEN-CASE match result (TKT-043) — a resolved context signal,
    # exactly like ``provider_match_state``; the classifier is TOLD, it never looks a
    # Case up (the workflow service owns the open-Case query, per ADR-0019).
    # ``one``/``ambiguous`` =
    # the named ref hit an OPEN case, so a work-shaped delivery on it is an update, not
    # fresh work. Default absent = ``none`` = "not matched / not resolved".
    open_case_state = _normalise(open_case_ref_match).strip().lower()
    open_case_match = open_case_state in {PROVIDER_ONE, PROVIDER_AMBIGUOUS}
    kinds = {str(k).strip().lower() for k in (attachment_kinds or []) if str(k).strip()}
    filenames = [str(f) for f in (attachment_filenames or []) if str(f).strip()]
    has_atts = bool(has_attachments) or bool(kinds)
    # PLAN-014 D4 (parse-fed unified triage reorder) — content-based attachment typing
    # (detection/attachment_typing.py's type_document_text, already surfaced via /parse)
    # was previously unavailable here: the classifier saw only the filename/extension-
    # derived ``kinds``, its own weakest signal (an invoice/remittance PDF reads as
    # ``instruction``; a photos-only PDF with a generic filename reads as neither
    # instruction nor report). ABSENT/EMPTY input is byte-for-bit identical to today's
    # output (parity-tested) — this parameter is purely additive.
    # Deliberate mirror image of classifyAttachment()'s OPPOSITE precedence
    # (packages/domain/src/domain/classification.ts: extension wins over MIME for cheap
    # evidence-KIND classification, since both signals there are equally-cheap guesses
    # about an unopened file) — here content is not a guess (parse already read the
    # document), so it is the stronger signal for this later-stage TRIAGE PROMOTION
    # concern. Reconciled PER FILE (not a coarse aggregate): a content 'report' on one
    # sibling no longer suppresses when another sibling is a content 'instruction'.
    content_doc_types = {
        str(t.get("doc_type", "")).strip().lower()
        for t in (attachment_content_typings or [])
        if isinstance(t, dict)
    }
    # Per-file reconciliation (PLAN-014 D4 contract: content overrides filename PER FILE).
    # A content-typed 'report' on ONE attachment must NOT suppress an email that ALSO carries a
    # content-typed 'instruction'; and a content-typed 'instruction' promotes even when its
    # FILENAME is generic. So 'report' counts only when no sibling is 'instruction'; a content
    # 'instruction' feeds has_instruction_doc directly. 'unknown' abstains (filename kind stands);
    # only 'junk' withdraws, and only when no sibling is a report/instruction.
    # PLAN-014 D5 backtest finding: withdrawing on a bare "unknown" verdict was too
    # aggressive -- "unknown" is the detector's OWN deliberate, safe abstain default
    # for anything it cannot confidently type (see attachment_typing.py's module
    # docstring, "abstain-to-unidentified bias"), not a confident negative signal.
    # Only a "junk" verdict (the detector's own high-precision, deliberately-tiny
    # negative bucket) withdraws a promotion; "unknown" alone does not.
    content_detected_instruction = "instruction" in content_doc_types
    content_detected_report = "report" in content_doc_types and not content_detected_instruction
    content_withdraws_instruction = "junk" in content_doc_types and not (
        content_doc_types & {"report", "instruction"}
    )
    is_reply = _is_reply(subject_s, _normalise(in_reply_to), _normalise(references))
    # A FORWARD ("FW:"/"FWD:") carries an INHERITED subject like a reply does, but may
    # carry a genuinely new instruction onward (so it is not a reply). collisionspike
    # TKT-093: a forward whose SENDER writes no new work language — just delivering a
    # document ("Audatex attached") — must not promote on the inherited subject's work
    # cue. ``is_forward`` gates that suppression + the case_update VRM anchor below.
    is_forward = bool(_FORWARD_SUBJECT_RE.match(subject_s))

    haystack = f"{subject_s}\n{body_s}"
    # Thread-scoping (collisionspike TKT-030/033). Two distinct jobs:
    #   * PROMOTION signals (work / query / audit) drive Rule 1/2/3 — they must read
    #     only what THIS sender wrote, never the quoted reply chain (a chase reply with
    #     the original multi-phrase instruction quoted below must not promote). On a
    #     reply the SUBJECT is inherited too (F467), so the scope is the sender-written
    #     BODY only; on fresh mail the subject is legitimately the sender's text (and
    #     carries instruction cues like "New eng ins", TKT-036), so it is included.
    #   * REFERENCE surfacing (vrm / caseref / jobref) reads the FULL haystack — a ref
    #     quoted out of the thread is exactly what the orchestrator's open-Case lookup
    #     wants (linkReply).
    sender_text = _sender_written_text(body_s)
    work_scope = sender_text if is_reply else f"{subject_s}\n{sender_text}"

    # ``From`` may be the bare mailbox or RFC 5322 display-name form. Compare the
    # actual mailbox, never the attacker-controlled display name. ``sender_domain``
    # is derived from the same Graph address and is therefore a consistency check,
    # not authentication. The recipient-stamped Authentication-Results result is the
    # independent trust signal; fail closed when it is absent or unaligned.
    from_mailbox = parseaddr(from_s)[1].strip().lower()
    website_form_sender_matches = (
        from_mailbox == _WEBSITE_FORM_ADDRESS
        and domain_s == _WEBSITE_FORM_DOMAIN
    )
    website_form_authenticated = (
        bool(_WEBSITE_FORM_DMARC_PASS_RE.search(authentication_s))
        and bool(_WEBSITE_FORM_COMPAUTH_PASS_RE.search(authentication_s))
    )
    website_form_markers = [
        name
        for name, present in (
            ("subject", bool(_WEBSITE_FORM_SUBJECT_RE.search(subject_s))),
            ("heading", bool(_WEBSITE_FORM_HEADING_RE.search(body_s))),
            ("footer", bool(_WEBSITE_FORM_FOOTER_RE.search(body_s))),
        )
        if present
    ]

    # PROMOTION signals — sender-scoped.
    work_phrases = _match_keywords(work_scope, _WORK_KEYWORDS)
    # Sender-written-only work phrases (never the inherited subject) — the forward
    # suppression discriminator (TKT-093): for a reply ``work_phrases`` already excludes
    # the subject, but for a FORWARD ``work_scope`` still includes it, so compute the
    # sender-only set explicitly.
    new_work_phrases = _match_keywords(sender_text, _WORK_KEYWORDS)
    # A possessive "your report" reference (TKT-082 s1) is about OUR existing work, so it
    # must neutralise the "engineers report" work keyword rather than promote new work.
    references_existing_report = bool(_OUR_REPORT_REFERENCE_RE.search(sender_text))
    query_phrases = _match_keywords(work_scope, _QUERY_KEYWORDS)
    billing_phrases = _match_keywords(work_scope, _BILLING_KEYWORDS)
    informal_phrases = _match_keywords(work_scope, _INFORMAL_WORK_KEYWORDS)
    chase_phrases = _match_keywords(work_scope, _CHASE_PHRASES)
    # Taxonomy v3 (TKT-105/120, TKT-084): inbound-payment and pre-instruction
    # wording — sender-scoped like every other promotion signal.
    payment_phrases = _match_keywords(work_scope, _PAYMENT_PHRASES)
    pre_instruction_phrases = _match_keywords(work_scope, _PRE_INSTRUCTION_PHRASES)
    # Taxonomy v2 (TKT-041): a cancellation phrase is ALSO sender-scoped — a
    # cancellation quoted out of an OLDER message in the thread must not cancel a
    # DIFFERENT, currently-live one. ``cancellation_negated`` is the cheap "not
    # cancelled" guard (see _CANCELLATION_NEGATION_RE); it suppresses the whole
    # cancellation signal rather than trying to un-match individual phrases.
    cancellation_phrases = _match_keywords(work_scope, _CANCELLATION_PHRASES)
    cancellation_negated = bool(_CANCELLATION_NEGATION_RE.search(work_scope))
    is_audit, audit_phrases = detect_audit_signals(work_scope)
    # REFERENCE surfacing + auto-reply + recap markers — full haystack.
    auto_reply_markers = _is_auto_reply(haystack)
    summary_markers = _match_keywords(haystack, _SUMMARY_MARKERS)
    body_vrm = _canonical_body_vrm(haystack)
    body_caseref = _first_match(CASEREF_RE, haystack)
    body_jobref = _job_reference(haystack)
    # Image-capture delivery service (TKT-102, Rule 0f) — full haystack, so a
    # FORWARDED Tractable delivery (identity riding in the quoted footer) still
    # registers. Identity (domain or footer phrase) AND delivery wording must
    # BOTH be present.
    image_service_identity = _sender_domain_matches(
        domain_s, _IMAGE_SERVICE_SENDER_DOMAINS
    ) or bool(_match_keywords(haystack, _IMAGE_SERVICE_IDENTITY_PHRASES))
    image_service_delivery_phrases = (
        _match_keywords(haystack, _IMAGE_SERVICE_DELIVERY_PHRASES)
        if image_service_identity
        else ()
    )
    # A chase / query trigger (a question OR a send-me-the-report chase).
    query_or_chase = bool(query_phrases) or bool(chase_phrases)

    provider_known = state == PROVIDER_ONE
    has_instruction_doc = (
        bool(kinds & _INSTRUCTION_KINDS) or content_detected_instruction
    ) and not content_withdraws_instruction
    has_images = bool(kinds & _IMAGE_KINDS)
    has_report_attachment = _has_report_attachment(filenames) or content_detected_report
    has_existing_ref = bool(body_caseref or body_jobref)
    # A case-summary DIGEST enumerates many Case/POs (a recap of work already accepted,
    # TKT-029) — never a single fresh instruction. Counted over the full haystack.
    distinct_caserefs = {
        re.sub(r"\s+", "", m.group(0)).upper() for m in CASEREF_RE.finditer(haystack)
    }
    digest = len(distinct_caserefs) >= 3

    signals: list[str] = []
    if work_phrases:
        signals.append("work_keywords:" + ",".join(work_phrases))
    if query_phrases:
        signals.append("query_keywords:" + ",".join(query_phrases))
    if billing_phrases:
        signals.append("billing_keywords:" + ",".join(billing_phrases))
    if informal_phrases:
        signals.append("informal_keywords:" + ",".join(informal_phrases))
    if chase_phrases:
        signals.append("chase_keywords:" + ",".join(chase_phrases))
    if cancellation_phrases:
        signals.append("cancellation_keywords:" + ",".join(cancellation_phrases))
        if cancellation_negated:
            signals.append("cancellation_negated")
    if payment_phrases:
        signals.append("payment_keywords:" + ",".join(payment_phrases))
    if pre_instruction_phrases:
        signals.append("pre_instruction_keywords:" + ",".join(pre_instruction_phrases))
    if image_service_delivery_phrases:
        signals.append("image_service_delivery:" + ",".join(image_service_delivery_phrases))
    if summary_markers:
        signals.append("summary_markers:" + ",".join(summary_markers))
    if audit_phrases:
        signals.append("audit_phrases:" + ",".join(audit_phrases))
    if auto_reply_markers:
        signals.append("auto_reply:" + ",".join(auto_reply_markers))
    if is_reply:
        signals.append("reply")
    if body_caseref:
        signals.append(f"body_caseref:{body_caseref}")
    if body_jobref:
        signals.append(f"body_jobref:{body_jobref}")
    if body_vrm:
        signals.append(f"body_vrm:{body_vrm}")
    if has_report_attachment:
        signals.append("report_attachment")
    if content_doc_types:
        signals.append("attachment_content_typings:" + ",".join(sorted(content_doc_types)))
    if digest:
        signals.append("digest_multiple_refs:" + ",".join(sorted(distinct_caserefs)))
    if state in {PROVIDER_ONE, PROVIDER_NONE, PROVIDER_AMBIGUOUS}:
        signals.append(f"provider_match_state:{state}")
    if open_case_state in {PROVIDER_ONE, PROVIDER_NONE, PROVIDER_AMBIGUOUS}:
        signals.append(f"open_case_ref_match:{open_case_state}")
    if kinds:
        signals.append("attachment_kinds:" + ",".join(sorted(kinds)))
    if website_form_sender_matches:
        signals.append("website_form_sender")
    if website_form_authenticated:
        signals.append("website_form_authenticated")
    if website_form_markers:
        signals.append("website_form_markers:" + ",".join(website_form_markers))

    def _result(category: str, subtype: str, confidence: float, rule: str) -> dict[str, Any]:
        return {
            "category": category,
            "subtype": subtype,
            "confidence": confidence,
            "signals": signals + [f"rule:{rule}"],
            "is_reply": is_reply,
            "body_vrm": body_vrm,
            "body_caseref": body_caseref,
            "body_jobref": body_jobref,
            "contract_version": CONTRACT_VERSION,
            "taxonomy_version": TAXONOMY_VERSION,
        }

    # --- Rule 0a (taxonomy v4, TKT-170): CE website general-enquiry form. ---
    # This precedes every work/update/reference rule because visitor free text may
    # legitimately contain a registration, claim reference, attachment or words such
    # as "report". Those are message content, never evidence of an existing CE case.
    if website_form_sender_matches and website_form_authenticated and len(website_form_markers) >= 2:
        return _result(
            CATEGORY_WEBSITE_ENQUIRY,
            SUBTYPE_WEBSITE_GENERAL_ENQUIRY,
            _CONFIDENCE_STRONG,
            "website_general_enquiry",
        )

    # Shared about-existing suppression (used by Rule 1 AND Rule 2). An email that is
    # about EXISTING work is suppressed out of the receiving-work rules and falls through
    # to the query rules. Two ways in:
    #   * query branch (long-standing, unchanged): a query phrase + NO work phrase
    #     anywhere in the text.
    #   * reply branch (collisionspike #3 — the ST04VRX / MX17PNL live failures): a reply
    #     (``is_reply``) whose SENDER added NO new work language. A work phrase in the
    #     QUOTED thread (e.g. our own report cover note quoted back) does NOT count — per
    #     "no NEW work phrase beyond the quoted thread" — so the reply branch keys on
    #     ``new_work_phrases`` (sender-written text only). This keeps precision both ways:
    #     a NEW instruction that happens to be a reply ("and here's the next job, please
    #     inspect …") carries a NEW work phrase, so it is NOT suppressed and still
    #     promotes. A bare Case/PO does NOT rescue it — the classifier cannot tell a
    #     freshly-minted Case/PO from one quoted out of the reply thread (that novelty
    #     check is the orchestrator's DB lookup), so fresh work LANGUAGE is the sole
    #     discriminator.
    # F467: ``work_phrases`` is already sender-scoped (``work_scope`` above), so the
    # "no NEW work phrase" discriminator reads neither the quoted thread nor a reply's
    # inherited subject. Four ways an email is suppressed out of the receiving-work
    # rules into the query/billing rules, all keyed on the absence of NEW work language
    # so a genuine "and here's the next job" reply still promotes:
    #   * query branch       : a query phrase + no work phrase;
    #   * reply branch (#3)  : a reply whose sender added no work phrase;
    #   * report branch      : an attached engineer's REPORT (existing-work artefact,
    #                          TKT-037/039) + no work phrase — a report passed back for
    #                          billing/support must not mint a new Case on the .pdf kind;
    #   * digest branch      : a multi-Case/PO summary (TKT-029) + no work phrase.
    suppress_as_query = (
        (bool(query_phrases) and not work_phrases)
        or (is_reply and not work_phrases)
        or (has_report_attachment and not work_phrases)
        or (digest and not work_phrases)
        # A high-precision CHASE phrase ("provide your report", "heard nothing further")
        # suppresses UNCONDITIONALLY — even alongside recapped work language — because a
        # chaser recaps the original instruction ("we instructed you to inspect ... but
        # heard nothing — please send your report"). A genuine new instruction never
        # contains a send-me-the-existing-report phrase (TKT-030/031/033).
        or bool(chase_phrases)
        # TKT-082 s1: a question ABOUT our existing report ("out of the 18 hours quoted in
        # your report, how many are for paint?") carries the "engineers report" work
        # keyword yet is about-existing — the possessive "your report" suppresses it.
        or references_existing_report
        # TKT-093: a FORWARD whose sender wrote no new work language (only "Audatex
        # attached") is delivering a document onto an existing matter, not instructing new
        # work — the inherited subject's work cue must not promote it.
        or (is_forward and not new_work_phrases)
        # TKT-043: orchestration resolved the email's named ref to an ALREADY-OPEN case
        # (``open_case_ref_match`` one/ambiguous). A work-shaped delivery on an open case
        # is an UPDATE to it, not fresh work — suppress the fresh-work promotion (Rules
        # 1-3) so it routes into the case_update lane (Rule 4a2/4d). Requires an existing
        # ref + NEW (non-report) evidence, so a bare acknowledgement or a report coming
        # back on an open case is untouched. This only PROPOSES the matching label; the
        # open-case ACTION (attach vs suggest, ambiguity handling) is still the
        # context-aware triage-policy layer's call (@cs/domain ``decideTriage``).
        or (
            open_case_match
            and has_existing_ref
            and ((has_atts and not has_report_attachment) or has_images)
        )
    )

    # --- Rule 0: an auto-reply / bounce marker forces ``other`` -----------------
    # A quoted out-of-office or bounce chain can echo work language and a stray
    # registration; an OOO or non-delivery report can also carry an attached image
    # (a signature logo, a returned-message screenshot, the original photo bounced
    # back). With no instruction doc it is not a fresh instruction, so abstain to
    # ``other`` rather than risk a wrong receiving-work label (abstain-to-other;
    # ADR-0015 Risk 2). This guard runs BEFORE the image/work rules so an auto-reply
    # with an image cannot slip through to Rule 2 and read as work.
    #
    # EXCEPTION — an attached instruction doc OVERRIDES the abstain. The instruction
    # doc is the module's strongest positive signal; a legitimate automated provider
    # instruction (instruction PDF attached, polite "please do not reply" footer) is
    # genuine work, and forcing it to ``other`` would silently lose the Case. When a
    # doc is present we fall through to Rule 1; the no-doc auto-reply+image path
    # still abstains here exactly as before.
    if auto_reply_markers and not has_instruction_doc:
        # TKT-081 s2: an AUTOMATED acknowledgement ("This is an automated email … Thank
        # you for your email, our team will review it") is a courtesy no-op — route it to
        # non_actionable/acknowledgement, never receiving_work (the live bug minted a
        # blank Case from one). Any OTHER auto-reply / OOO / bounce still abstains to
        # ``other`` (an unread signature logo or bounced image must not read as work).
        if _is_bare_acknowledgement(sender_text):
            return _result(
                CATEGORY_NON_ACTIONABLE,
                SUBTYPE_ACKNOWLEDGEMENT,
                _CONFIDENCE_WEAK,
                "auto_acknowledgement",
            )
        return _result(
            CATEGORY_OTHER,
            SUBTYPE_OTHER,
            _CONFIDENCE_ABSTAIN,
            "auto_reply_marker",
        )

    # --- Rule 0b: an explicit case-summary / digest is never a fresh instruction ----
    # A recap of work already accepted (TKT-029) — "a summary of the instructions sent
    # yesterday" — carries an instruction-kind PDF (the per-case list) and even trips a
    # work keyword via a plural subject ("New inspection requests"), so it must be caught
    # BEFORE Rule 1. Routed to non_actionable/case_summary (the operator: "we would
    # already have accepted these"). Distinct from `other` — it is recognised, not junk.
    if summary_markers:
        return _result(
            CATEGORY_NON_ACTIONABLE,
            SUBTYPE_CASE_SUMMARY,
            _CONFIDENCE_WEAK,
            "case_summary",
        )

    # --- Rule 0c: a cancellation phrase trumps everything below (TKT-041, taxonomy v2)
    # The sender is calling off an existing instruction, claim or inspection outright.
    # HIGHEST PRECEDENCE of every rule in this module — checked before the
    # instruction-doc promotion (Rule 1) so a forwarded "please close this one off"
    # email with the ORIGINAL instructions quoted/attached below it still classifies
    # cancellation, not receiving_work (real eval item tkt041-07: a known provider's
    # instruction doc would otherwise promote strongly at Rule 1). Guarded by the
    # cheap negation check ("this has NOT been cancelled") and scanned in the
    # SENDER-WRITTEN scope only, so a cancellation phrase sitting in a QUOTED older
    # message cannot cancel a different, currently-live thread.
    #
    # A case-existence hint (body_caseref / body_jobref / body_vrm / is_reply) is NOT
    # a gate — the phrase alone is enough to fire. It only bands the confidence: a
    # named Case/PO or job ref is GOOD (0.8), anything weaker (a bare VRM, a reply
    # with no other hint, or no hint at all) is WEAK (0.6) — a cancellation with no
    # reference in it is still a cancellation; the context-aware triage-policy layer
    # (open-case lookup, ADR-0019) decides what action that implies.
    if cancellation_phrases and not cancellation_negated:
        cancellation_confidence = (
            _CONFIDENCE_GOOD if (body_caseref or body_jobref) else _CONFIDENCE_WEAK
        )
        return _result(
            CATEGORY_CANCELLATION,
            SUBTYPE_CANCELLATION_NOTICE,
            cancellation_confidence,
            "cancellation_notice",
        )

    # --- Rule 0d: an inbound payment notification (TKT-105/120, taxonomy v3) ----
    # A remittance advice / payment-transfer notice for work we already did. It
    # typically carries a payment PDF whose extension-derived kind is
    # "instruction", so it MUST be caught before the Rule-1 instruction-doc
    # promotion — the live TKT-105 failure minted receiving_work·
    # existing_provider_instruction from an Express Solicitors remittance advice.
    # The phrase alone fires (like cancellation): a payment notice with no ref is
    # still a payment notice. A named ref bands the confidence up. Routed to the
    # BILLING category (the money-lane umbrella) under the v3 payment_remittance
    # subtype — the mirror-image of billing_request (them asking for our invoice).
    # KNOWN LIMIT: an automated remittance whose footer trips an auto-reply
    # marker ("do not reply") abstains at Rule 0 before reaching here — extend
    # Rule 0's override if a real miss of that shape turns up.
    if payment_phrases:
        payment_confidence = (
            _CONFIDENCE_GOOD if (body_caseref or body_jobref) else _CONFIDENCE_WEAK
        )
        return _result(
            CATEGORY_BILLING,
            SUBTYPE_PAYMENT_REMITTANCE,
            payment_confidence,
            "payment_remittance",
        )

    # --- Rule 0e: pre-instruction directions (TKT-084, taxonomy v3) -------------
    # The sender is telling us what to do WHEN the official instruction later
    # arrives ("when you receive an instruction from RJ on this one please hold
    # off from obtaining images"). Not yet an instruction — NO case may be minted
    # — but not noise: the workflow service holds the row and correlates it onto the
    # case the later instruction mints (gated TRIAGE_PRE_INSTRUCTION_ENABLED; the
    # pure classifier only proposes the label). Precision guards:
    #   * every phrase is anchored to a FUTURE-instruction reference (see
    #     _PRE_INSTRUCTION_PHRASES) — a bare "hold off" never fires;
    #   * an attached instruction doc disqualifies (the instruction IS here);
    #   * >=2 formal work phrases disqualify (a genuine instruction that happens
    #     to add "further instructions to follow" stays receiving_work);
    #   * an identifier is required (a VRM or any reference) so an unanchored
    #     "instructions will follow" newsletter abstains;
    #   * a question/chase defers to the query rules (asks > directs).
    if (
        pre_instruction_phrases
        and not has_instruction_doc
        and len(work_phrases) < 2
        and (body_vrm or body_caseref or body_jobref)
        and not query_or_chase
        # C2 (collisionspike): a genuine body-only instruction must win over the
        # pre_instruction lane. When Rule 3's second arm (``strong_body_instruction``)
        # would promote this to receiving_work — a FRESH (non-reply) email carrying a
        # work phrase + a body VRM + an existing ref and asking no question — it is
        # real work, not a pre-instruction heads-up (boilerplate like "instructions to
        # follow" must not demote it). Disqualify here, mirroring that arm EXACTLY
        # (incl. the work-phrase term) so the pre_instruction lane still fires for the
        # genuine "directions with NO work cue" case, which that arm never catches.
        # Kept in lockstep with the Rule-3 second arm below.
        and not (
            not is_reply
            and bool(work_phrases)
            and body_vrm
            and has_existing_ref
            and not query_phrases
        )
    ):
        return _result(
            CATEGORY_PRE_INSTRUCTION,
            SUBTYPE_PRE_INSTRUCTION_DIRECTIONS,
            _CONFIDENCE_GOOD,
            "pre_instruction_directions",
        )

    # --- Rule 0f: an image-capture service delivering a completed capture -------
    # (collisionspike TKT-102 — the Tractable "New completed lead" email.) An
    # IDENTITY anchor (the tractable.ai sender domain, or the "Powered by
    # Tractable" footer on a forward) plus the completed-capture DELIVERY wording
    # ("completed lead" / "damage capture") marks a service CE itself
    # commissioned delivering the client's damage photos + summary PDF. It is an
    # update to a matter CE already knows about — case_update · images_received —
    # and must NEVER mint fresh work: its PDF's extension-derived kind is
    # "instruction", so this rule sits BEFORE the Rule-1 instruction-doc
    # promotion (exactly like Rule 0d's payment lane). The workflow service owns
    # the case lookup (the classifier surfaces body_vrm/body_jobref as
    # usual — for these emails typically empty: the identifiers live in the PDF,
    # parsed later by /parse). KNOWN LIMIT (mirrors Rule 0d): a variant whose
    # footer trips an auto-reply marker abstains at Rule 0 first.
    if image_service_delivery_phrases:
        return _result(
            CATEGORY_CASE_UPDATE,
            SUBTYPE_IMAGES_RECEIVED,
            _CONFIDENCE_GOOD,
            "image_service_delivery",
        )

    # --- Rule 1: an instruction document is necessary but NOT sufficient --------
    # The attachment kind is derived from the file extension alone (.pdf/.doc/.docx
    # -> "instruction"), so a spam flyer, invoice, statement, newsletter or forwarded
    # letter all carry one. Promotion therefore requires CORROBORATION:
    #   * a known provider domain (the match IS the corroboration) — and ONLY this
    #     path may emit the existing-provider / audit subtypes; or
    #   * for an unknown provider, a work phrase OR a body Case/PO. A body VRM does
    #     NOT corroborate: VRM_RE is deliberately loose for /parse field extraction
    #     and over-matches postcodes / model codes / years, so a lone VRM-shaped token
    #     must not mint a Case (it is still returned for the open-Case VRM fallback).
    #   * audit phrases ALONE never promote an unknown-provider doc — there is no
    #     new-client-audit subtype, and labelling it existing_provider_audit would
    #     attribute an "A."-prefixed Case/PO to a provider that does not exist.
    # An about-existing email that merely re-attaches an instruction doc — query wording
    # OR a reply (``is_reply``), with no NEW work phrase — is SUPPRESSED here (shared
    # ``suppress_as_query``) and falls through to the query rules (exactly as Rule 2 does
    # for images): a client replying after our report went out, with our own report
    # re-attached, must not mint a duplicate Case. With no corroboration at all the doc is
    # flagged ``uncorroborated_instruction_doc`` and falls through (abstain-to-other).
    if has_instruction_doc:
        if not suppress_as_query:
            if provider_known:
                if is_audit:
                    return _result(
                        CATEGORY_RECEIVING_WORK,
                        SUBTYPE_EXISTING_PROVIDER_AUDIT,
                        _CONFIDENCE_STRONG,
                        "instruction_doc_audit",
                    )
                return _result(
                    CATEGORY_RECEIVING_WORK,
                    SUBTYPE_EXISTING_PROVIDER_INSTRUCTION,
                    _CONFIDENCE_STRONG,
                    "instruction_doc_existing_provider",
                )
            if work_phrases or body_caseref:
                return _result(
                    CATEGORY_RECEIVING_WORK,
                    SUBTYPE_NEW_CLIENT_WORK,
                    _CONFIDENCE_GOOD,
                    "instruction_doc_new_client",
                )
        # Not promoted. Flag ONLY when genuinely uncorroborated (not merely
        # query-suppressed): a query-suppressed doc that DID carry a provider match /
        # work phrase / Case/PO must not also carry the contradictory ``uncorroborated``
        # marker the deferred LLM pass keys on.
        if not (provider_known or work_phrases or body_caseref):
            signals.append("uncorroborated_instruction_doc")
        # FALL THROUGH to the query / abstain rules.

    # --- Rule 2: images + a corroborating work signal confirms work -------------
    # An attached image plus a work phrase or a body Case/PO reads as a fresh
    # instruction (a new client's photos with "please inspect", a provider's photos
    # quoting the Case/PO). A known provider domain on its OWN is too weak to promote
    # a bare image (a forwarded chain, a signature logo, or a returned-message
    # screenshot all match the domain); a body VRM is too loose (see Rule 1). An audit
    # signal promotes ONLY for a known provider — the only path that can emit the audit
    # subtype — so an audit-shaped image from an unknown provider abstains. An
    # about-existing email that merely re-attaches the original photo — query phrasing OR
    # a reply (``is_reply``), no work phrase (shared ``suppress_as_query``) — falls
    # through to the query rules (abstain bias; ADR-0015; collisionspike #3). An
    # instruction doc was already handled at Rule 1.
    # TKT-040: an INFORMAL work request (no formal "please inspect" verb) that arrives
    # with damage PHOTOS and a real job identifier (Case/PO, job ref, or VRM) is genuine
    # work — but informal wording ALONE (no identifier) must still abstain, to preserve
    # the abstain-to-other bias. The identifier is the corroboration the informal phrase
    # lacks.
    informal_corroborated = bool(
        informal_phrases and (body_caseref or body_jobref or body_vrm)
    )
    if (
        has_images
        and (work_phrases or body_caseref or (is_audit and provider_known) or informal_corroborated)
        and not suppress_as_query
    ):
        if provider_known and is_audit:
            subtype = SUBTYPE_EXISTING_PROVIDER_AUDIT
        elif provider_known:
            subtype = SUBTYPE_EXISTING_PROVIDER_INSTRUCTION
        else:
            subtype = SUBTYPE_NEW_CLIENT_WORK
        return _result(
            CATEGORY_RECEIVING_WORK,
            subtype,
            _CONFIDENCE_GOOD,
            "images_with_work_signal",
        )
    if has_images and provider_known and not (work_phrases or body_caseref or is_audit):
        # Images from a known provider with NO corroborating signal: not promoted.
        # Flag for the deferred LLM pass; fall through. NOT appended when Rule 2 was
        # suppressed by the query-guard on a corroborated image — that row is a query.
        signals.append("uncorroborated_provider_image")

    # --- Rule 3: no attachment, but a body instruction (>=2 work phrases + id) --
    # The two-phrase floor + a real Case/PO or VRM is what lets a typed-in-body
    # instruction through WITHOUT risking a single stray phrase in a signature
    # tipping a query into work (abstain-to-other bias). Guarded by ``suppress_as_query``
    # (TKT-030/033): a chase reply quoting the original instruction below must not
    # promote — the work phrases are already sender-scoped, and the guard is the
    # explicit backstop.
    # TKT-083: the two-phrase floor abstained a clear body-only "New INSTRUCTIONS:" email
    # that carried only ONE work phrase but a full identifier set (a job ref AND a VRM) —
    # e.g. a solicitor's structured instruction. A SECOND arm promotes a FRESH (non-reply)
    # instruction that has a work phrase + a body VRM + an existing job/Case reference and
    # asks no question: the ref-plus-VRM corroboration substitutes for the second phrase.
    # Gated to non-reply + no-query + not-suppressed so a chase/ack reply cannot slip in.
    #
    # ADJUDICATED 2026-07-09 (PLAN-003): the ticket's original acceptance asked for
    # "ref OR VRM" here. An A/B over the FULL 52-item eval corpus showed the OR
    # widening fixes ZERO items and regresses ONE — the real hold-request email
    # ("place this file on hold ... until further instructions", a work phrase + a
    # ref, no VRM) would leave the abstain lane and promote to receiving_work,
    # i.e. a hold request would MINT a case. The AND (ref + VRM both) therefore
    # STANDS; see tkt041-06 and the vrm+ref pin below.
    strong_body_instruction = (
        (len(work_phrases) >= 2 and (body_caseref or body_vrm))
        or (
            not is_reply
            and bool(work_phrases)
            and bool(body_vrm)
            and has_existing_ref
            and not query_phrases
        )
    )
    if not has_atts and strong_body_instruction and not suppress_as_query:
        subtype = (
            SUBTYPE_EXISTING_PROVIDER_INSTRUCTION
            if provider_known
            else SUBTYPE_NEW_CLIENT_WORK
        )
        return _result(
            CATEGORY_RECEIVING_WORK,
            subtype,
            _CONFIDENCE_WEAK,
            "body_only_instruction",
        )

    # --- Rule 4 (billing): an invoice / fee request is about a job we did -------
    # TKT-037: "please provide the invoice", typically with our own report attached.
    # Not new work, not a generic query — its own billing bucket. Consulted after the
    # work rules (an email that both bills and instructs read as work above).
    if billing_phrases:
        return _result(
            CATEGORY_BILLING,
            SUBTYPE_BILLING_REQUEST,
            _CONFIDENCE_GOOD,
            "billing_request",
        )

    # --- Rule 4a: a question/chase naming a Case/PO, job ref or VRM — about work we did
    # The classifier proposes query_existing_work; orchestration confirms the open-Case link
    # (Case/PO first, then job ref, then VRM; it never auto-links on ambiguity). A chase
    # for a report we owe (TKT-030/031/033) reaches here via ``query_or_chase``.
    if query_or_chase and (has_existing_ref or body_vrm):
        return _result(
            CATEGORY_QUERY,
            SUBTYPE_QUERY_EXISTING_WORK,
            _CONFIDENCE_GOOD,
            "query_with_reference",
        )

    # --- Rule 4a2 (case_update, taxonomy v2, collisionspike P1-5): a REPLY that
    # DELIVERS new image evidence (damage photos) on an existing job, asking nothing,
    # is a case UPDATE — not merely a query about work we did. It must be caught BEFORE
    # Rule 4b (which would label any referenced reply query_existing_work), so a
    # provider replying "here are the images you asked for" surfaces as
    # case_update/images_received rather than a generic query. Gated tightly to avoid
    # stealing genuine queries: it needs GENUINE image evidence (a non-signature photo
    # attachment, not an inline logo — ``_has_new_image_evidence``), NO query/chase
    # phrase in the sender-written scope (an email that ALSO asks a question is a query
    # first, so a chase reply that re-attaches the original photo still routes to the
    # query rules), NOT a bare acknowledgement (TKT-038: "Thanks Ed" + signature logos
    # must stay acknowledgement), and an existing-job reference or VRM to anchor it.
    if (
        is_reply
        and _has_new_image_evidence(filenames)
        and not query_or_chase
        and not _is_bare_acknowledgement(sender_text)
        and (has_existing_ref or body_vrm)
    ):
        images_only = _delivered_images_only(kinds, filenames)
        reply_update_subtype = (
            SUBTYPE_IMAGES_RECEIVED if images_only else SUBTYPE_UPDATE_GENERAL
        )
        reply_update_confidence = _CONFIDENCE_GOOD if body_caseref else _CONFIDENCE_WEAK
        return _result(
            CATEGORY_CASE_UPDATE,
            reply_update_subtype,
            reply_update_confidence,
            "reply_with_new_images",
        )

    # --- Rule 4b: a reply (not a bare acknowledgement) naming a reference -------
    # A reply carrying no NEW work phrase but naming a Case/PO, job ref or VRM is about
    # work we did (collisionspike #3). EXCEPT a bare acknowledgement ("Thanks Ed", whose
    # only reference rode in on the inherited subject) asks nothing — it must NOT propose
    # a query off that inherited ref (TKT-038); it falls through to the no-action rule.
    if is_reply and not _is_bare_acknowledgement(sender_text) and (has_existing_ref or body_vrm):
        return _result(
            CATEGORY_QUERY,
            SUBTYPE_QUERY_EXISTING_WORK,
            _CONFIDENCE_GOOD,
            "reply_with_reference",
        )

    # --- Rule 4c: an engineer's REPORT attached + a reference — about work we did
    # A report sent back for support/justification (TKT-039) names an existing ref/VRM
    # and carries our report. Not new work (Rule 1 suppressed it), not generic noise —
    # a query about an existing report.
    if has_report_attachment and (has_existing_ref or body_vrm):
        return _result(
            CATEGORY_QUERY,
            SUBTYPE_QUERY_EXISTING_WORK,
            _CONFIDENCE_GOOD,
            "report_with_reference",
        )

    # --- Rule 4d (case_update, taxonomy v2, TKT-034/043): an existing-job reference
    # PLUS new evidence reads as work arriving on a case already open — not a query,
    # not a fresh instruction. TEXT-LEVEL PROPOSAL ONLY: the classifier cannot see
    # whether the reference actually matches an OPEN case (that lookup is the
    # context-aware triage-policy layer's job, per the Phase-2 plan / ADR-0019) — it
    # only reports what the text + attachments show.
    #
    # Inserted AFTER Rules 4a/4b/4c so today's chaser/report/reply-with-reference
    # handling keeps winning (the confusion-matrix targets say those currently-correct
    # behaviours must not regress) — in particular a report-shaped attachment is
    # excluded from "new evidence" below AND, paired with a reference, is already
    # claimed by Rule 4c before this rule is ever reached. Rule 4b (any SUBSTANTIVE
    # reply naming a reference, regardless of attachments) also already claims almost
    # every non-bare-ack reply before this point, so in practice this rule is mostly
    # reached by a FRESH (non-reply) mention of a reference.
    #
    # BARE-ACKNOWLEDGEMENT GUARD (TKT-038 regression): a reply whose sender-written
    # text is ONLY a pleasantry ("Thanks Ed") must stay non_actionable/acknowledgement
    # even when it carries an attachment — the real TKT-038 email is exactly this: a
    # "Thanks Ed" reply naming a job ref, with several embedded SIGNATURE/logo images
    # attached (the classifier cannot yet distinguish a signature logo from a genuine
    # damage photo attachment — that raster-floor typing is TKT-047, out of scope
    # here). Treating a bare "thanks" as delivered evidence would misread a courtesy
    # reply as an actionable case update, so bare acknowledgements are excluded here
    # exactly as Rule 4b already excludes them.
    #
    # "New evidence" is an attachment that is not just our own report coming back: an
    # image attachment kind, or any other attachment that a filename check does not
    # recognise as a report. A query phrase in sender scope defers to the query rules
    # instead (an email that both asks a question AND attaches something is still a
    # query first).
    new_evidence = (has_atts and not has_report_attachment) or has_images
    is_bare_ack_reply = is_reply and _is_bare_acknowledgement(sender_text)
    # A reply/forward that DELIVERS new evidence onto an existing matter is anchored by a
    # body VRM too (TKT-093: a forwarded "Audatex attached" whose only identifier is the
    # vehicle registration). Fresh mail keeps the stricter Case/PO-or-job-ref anchor — a
    # bare VRM is too loose to open a new case_update lane without a thread behind it.
    case_update_anchor = (
        bool(body_caseref or body_jobref)
        or ((is_reply or is_forward) and bool(body_vrm))
    )
    if (
        case_update_anchor
        and new_evidence
        and not query_phrases
        and not is_bare_ack_reply
    ):
        images_only = _delivered_images_only(kinds, filenames)
        case_update_subtype = SUBTYPE_IMAGES_RECEIVED if images_only else SUBTYPE_UPDATE_GENERAL
        case_update_confidence = _CONFIDENCE_GOOD if body_caseref else _CONFIDENCE_WEAK
        return _result(
            CATEGORY_CASE_UPDATE,
            case_update_subtype,
            case_update_confidence,
            "case_update_new_evidence",
        )

    # --- Rule 5: a question/chase with no reference — existing if known, else enquiry -
    if query_or_chase:
        subtype = (
            SUBTYPE_QUERY_EXISTING_WORK if provider_known else SUBTYPE_QUERY_NEW_ENQUIRY
        )
        return _result(
            CATEGORY_QUERY,
            subtype,
            _CONFIDENCE_WEAK,
            "query_keyword_only",
        )

    # --- Rule 5b: a bare acknowledgement reply — no action -----------------------
    # "Thanks Ed" / "Noted, cheers": a reply that asks nothing and instructs nothing
    # (TKT-038). Distinct from ``other`` (genuinely unidentified) — it is recognised,
    # just non-actionable.
    if is_reply and _is_bare_acknowledgement(sender_text):
        return _result(
            CATEGORY_NON_ACTIONABLE,
            SUBTYPE_ACKNOWLEDGEMENT,
            _CONFIDENCE_WEAK,
            "acknowledgement",
        )

    # --- Rule 5c: a multi-Case/PO case-summary digest — no action ----------------
    # A recap of work already accepted (TKT-029) enumerating several Case/POs — not a
    # fresh instruction. Reaches here only when suppressed above (no work phrase).
    if digest:
        return _result(
            CATEGORY_NON_ACTIONABLE,
            SUBTYPE_CASE_SUMMARY,
            _CONFIDENCE_WEAK,
            "case_digest",
        )

    # --- Rule 6: abstain — unidentified email lands in the catch-all bucket -----
    return _result(
        CATEGORY_OTHER,
        SUBTYPE_OTHER,
        _CONFIDENCE_ABSTAIN,
        "abstain_to_other",
    )
