"""Deterministic inbound-email classifier (Phase 8, Phase A).

A single PURE function — :func:`classify_email` — that reads an inbound email's
already-decoded fields and returns the operator's triage label. It is the Python
engine behind the parser Function's ``POST /classify-email`` route (the strong
signals already live in :mod:`cedocumentmapper_v2.rules.engine`, so re-deriving
them in Power Fx would duplicate and drift). No Dataverse, no network, no LLM —
just the same keyword / phrase / regex matching the rest of the engine uses, so
it is trivially unit-testable.

Taxonomy (two stable, append-only choicesets; see collisionspike ADR-0015 + the
Phase-2 rules-engine-v2 plan). This block documents the CURRENT taxonomy — v1
(receiving_work/query/other, six subtypes) plus the ADDITIVE categories layered on
since: billing + non_actionable (three more subtypes), and now case_update +
cancellation (v2, three more subtypes). ``taxonomy_version`` in every response tells
a consumer which generation of codes a row was labelled at (existing rows keep their
v1/v1.1 codes — no backfill on a taxonomy bump):

    category  : receiving_work | query | billing | non_actionable | other
                | case_update | cancellation                        (v2, additive)
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
OPEN Case with no instruction doc?) stays on the flow side, exactly as the open
question of "which Case does this belong to" stays out of ``/parse``. The
classifier surfaces ``body_caseref`` and ``body_vrm`` so the flow can run that
Dataverse lookup itself and, on a match, keep the ``query_existing_work`` label
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
    provider_match_state  one | none | ambiguous  (the flow's domain match result)
    attachment_kinds      list of attachment kinds, e.g. ["instruction", "image"]
    has_attachments       bool
    in_reply_to           the RFC-5322 In-Reply-To header, if the caller passes it
    references            the RFC-5322 References header, if the caller passes it

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
    taxonomy_version  int   the taxonomy generation this row was labelled at (2)
"""

from __future__ import annotations

import re
from typing import Any

from cedocumentmapper_v2.rules.engine import (
    detect_audit_signals,
    vrm_candidate_is_bad,
    _match_keywords,
    _WORK_KEYWORDS,
    _QUERY_KEYWORDS,
    _BILLING_KEYWORDS,
    _INFORMAL_WORK_KEYWORDS,
    _CHASE_PHRASES,
    _SUMMARY_MARKERS,
    _CANCELLATION_PHRASES,
)

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

# Response envelope taxonomy generation. Bumped only when a category/subtype is
# ADDED (never on a wording/confidence tweak) so a consumer (SPA filters, the
# eval-corpus scorer, the DDL choicesets) can tell which codes a row may carry.
# Existing rows keep their old-generation codes — no backfill.
TAXONOMY_VERSION = 2

# Provider-match states the flow passes in (mirrors the intake flow's domain
# match: a known provider domain matched exactly one / none / more than one row).
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
# a 3-to-4-digit provider case number, optionally carrying the "A." audit prefix.
# The real corpus splits two ways and the pattern mirrors it exactly:
#   * a 2-letter Principal always carries a 3-digit sequence  -> 5 trailing digits
#     ("MP26071", "AX26353", "FW26251");
#   * a 3-5-letter Principal carries a 3-OR-4-digit sequence   -> 5-6 trailing digits
#     ("CCPY26050", "ALS26066", "A.PCH261269", "QDOS261253").
# Anchoring the 2-letter arm to exactly 5 digits is what excludes a stray 6-digit
# token like "AB123456" (2 letters + 6 digits) while still admitting the genuine
# 6-digit refs (which all have >=3 letters). NOT a bare alphanumeric run, so a phone
# number, postcode, or VAT number in the body cannot masquerade as a Case/PO.
# Case-insensitive; tolerates an optional space after the "A.".
CASEREF_RE = re.compile(
    r"\b(?:A\.\s?)?(?:[A-Z]{2}\d{2}\d{3}|[A-Z]{3,5}\d{2}\d{3,4})\b",
    re.IGNORECASE,
)

# --- Existing-job reference extractor (collisionspike TKT-031/037/039/040) --- #
# Real existing-job references do NOT all match the strict Case/PO shape above:
# providers quote "Our Ref 575689", "your ref 45391_1", "SAB_46286_1", "206848.001".
# These are too loose to MINT a new Case (a phone number or quote number is the same
# shape), so they are surfaced as an ABOUT-EXISTING signal + a linkReply hint ONLY —
# never as new-client promotion corroboration (Rule 1/2/3 still require body_caseref).
#
#  (1) Labelled: an explicit "our/your ref" / "ref" / "claim" label immediately
#      followed by an alphanumeric token (the LABEL is what makes a bare number safe).
#      The token may use '/', '_', '.' or '-' separators ("SAB/46286/1", "206848.001").
_LABELLED_REF_RE = re.compile(
    r"\b(?:our\s+ref(?:erence)?|your\s+ref(?:erence)?|ref(?:erence)?|claim(?:\s+no)?)"
    r"\s*[:.\-#]?\s*"
    r"([A-Z0-9][A-Z0-9_./-]{2,})",
    re.IGNORECASE,
)
#  (2) Structured client ref: an alphanumeric token with a '/', '_' or '.' separator
#      and a digit run — "SAB/46286/1", "45391_1", "206848.001". Anchored to >=2
#      segments so a normal word or a plain number is excluded.
_STRUCTURED_REF_RE = re.compile(
    r"\b([A-Z]{0,5}\d{3,}(?:[_./]\d{1,4}){1,3}|[A-Z]{2,5}[_/]\d{3,}(?:[_/]\d{1,4})*)\b",
    re.IGNORECASE,
)


def _job_reference(text: str) -> str:
    """First existing-job reference (labelled "our ref N" or structured "SAB/46286/1"),
    uppercased / whitespace-stripped, or "". Distinct from CASEREF_RE: an ABOUT-EXISTING
    signal + linkReply hint only — too loose to mint a new Case, so it never feeds the
    new-client promotion arms. A labelled token must contain a digit (so "ref: see below"
    is not mistaken for a reference)."""
    if not text:
        return ""
    m = _LABELLED_REF_RE.search(text)
    if m and re.search(r"\d", m.group(1)):
        return re.sub(r"\s+", "", m.group(1)).upper()
    m = _STRUCTURED_REF_RE.search(text)
    if m:
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


# --- Bare-acknowledgement detector (collisionspike TKT-038) ------------------ #
# A reply whose SENDER-written text is only a short pleasantry ("Thanks Ed", "Noted,
# cheers") asks nothing and instructs nothing. It must NOT propose a query off an
# inherited-subject VRM/ref — it is no-action (-> non_actionable). Guarded by length
# so "Thanks — and please also inspect AB12 CDE" (a real request) does NOT match.
_ACK_ONLY_RE = re.compile(
    r"^(?:thanks?|thank\s+you|many\s+thanks|thanks\s+very\s+much|cheers|noted|"
    r"received(?:\s+with\s+thanks)?|great|perfect|brilliant|lovely|ok(?:ay)?|"
    r"got\s+it|much\s+appreciated|appreciated|understood)\b",
    re.IGNORECASE,
)
# A bare ack is SHORT — "Thanks Ed", "Noted, cheers". Bounded tight so a courtesy that
# carries a substantive statement ("Thank you, I have shared this with my client.") is
# NOT swallowed (it stays a query the orchestrator can link). TKT-038.
_ACK_MAX_LEN = 40


def _is_bare_acknowledgement(sender_text: str) -> bool:
    """True when the sender's FIRST written line is only a short pleasantry — a reply that
    asks nothing and instructs nothing ("Thanks Ed", "Noted, cheers"). Keyed on the first
    meaningful line so a trailing email SIGNATURE does not defeat it (TKT-038); a question
    mark or a longer first line (a substantive statement, e.g. "Thank you, I have shared
    this with my client.") disqualifies it. The query/chase rules run BEFORE the
    acknowledgement rule, so a reply that thanks AND asks still routes to the query."""
    for line in (sender_text or "").splitlines():
        first = line.strip()
        if not first:
            continue
        if len(first) > _ACK_MAX_LEN or "?" in first:
            return False
        return bool(_ACK_ONLY_RE.match(first))
    return False

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
# Words that must sit near a loose/dateless candidate for it to count as a VRM.
_VRM_CONTEXT_WORDS: tuple[str, ...] = (
    "reg",  # also covers "registration"
    "registration",
    "vrm",
    "vehicle",
    "plate",
)
# How far either side of a loose candidate to look for a context word / postcode.
_VRM_CONTEXT_WINDOW = 30

# Common English words a WELL-FORMED VRM's 3-letter alpha group can accidentally
# spell out of natural-language / model text ("Model X5 now …" -> "X5 NOW";
# "the GO12 OFF …"). A Tier-1 candidate whose trigram is one of these is rejected
# ONLY when no VRM context word sits beside it — a genuine plate that spells a word
# ("reg AB12 NEW") still passes on the context anchor (collisionspike #7 / F162).
# Deliberately small + conservative so real plates (AP70 WAA, MX17 PNL, A123 BCD,
# ABC 123D) are never dropped.
_VRM_STOPWORD_TRIGRAMS: frozenset[str] = frozenset({
    "NOW", "NEW", "OUT", "OFF", "AND", "THE", "FOR", "ALL", "ANY", "ONE",
    "TWO", "WAS", "ARE", "HAS", "HAD", "YOU", "OUR", "NOT", "BUT", "WHO",
    "WHY", "HOW", "CAN", "GET", "GOT", "SEE", "DUE", "PER", "VAT", "TAX",
})


def _wellformed_trigram_is_stopword(candidate: str) -> bool:
    """True when a well-formed VRM candidate's 3-letter alpha group spells a common
    English stop-word — a strong hint it is natural-language noise, not a plate
    (collisionspike #7 / F162). The whitespace-stripped candidate is split into its
    maximal letter runs; a run of exactly three letters that is a known stop-word
    trips it (covers the trailing trigram of the current/prefix shapes AND the
    leading trigram of the dateless-suffix shape)."""
    compact = re.sub(r"\s+", "", candidate).upper()
    return any(
        len(run) == 3 and run in _VRM_STOPWORD_TRIGRAMS
        for run in re.findall(r"[A-Z]+", compact)
    )


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
        if not any(word in lowered[start:end] for word in _VRM_CONTEXT_WORDS):
            continue  # dateless shape with no "reg/registration/vrm/vehicle/plate"
        return re.sub(r"\s+", "", candidate).upper()
    return ""


# Out-of-office / automatic-reply / bounce markers. These do NOT drop the email
# (everything is categorised) — they bias an otherwise weak email firmly to
# ``other`` so an auto-reply that happens to quote a work phrase in its history is
# not mistaken for a fresh instruction.
_AUTO_REPLY_MARKERS: tuple[str, ...] = (
    "out of office",
    "out-of-office",
    "automatic reply",
    "auto-reply",
    "autoreply",
    "i am currently away",
    "i am out of the office",
    "on annual leave",
    "away from my desk",
    "delivery has failed",
    "delivery status notification",
    "undeliverable",
    "mail delivery failed",
    "message could not be delivered",
    "returned to sender",
    "do not reply",
    "do-not-reply",
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
# A reply prefix is "RE"/"AW"/"SV" (intl) followed by EITHER a colon OR whitespace
# (real Outlook subjects do "RE 30143 - ..." with no colon, TKT-030/031). The
# separator is REQUIRED and immediate, so "Re-inspection" (glued hyphen) and "Review"
# (next char a letter) are NOT replies. Forward longest-first ("fwd" before "fw") so
# "FWD:" is not mis-split. (collisionspike #3 / TKT-031)
_REPLY_SUBJECT_RE = re.compile(r"^\s*(?:re|aw|sv)(?::|\s)", re.IGNORECASE)
_FORWARD_SUBJECT_RE = re.compile(r"^\s*(?:fwd|fw)(?::|\s)", re.IGNORECASE)


def _is_reply(subject: str, in_reply_to: str, references: str) -> bool:
    """Return True when the email is a REPLY in an existing thread (not a forward).

    Precedence (collisionspike #3):
      * A forward (``FW:`` / ``FWD:`` subject) is NEVER a reply — it is an onward-send
        that may carry a genuinely NEW instruction, so it must not trip the
        about-existing suppression. Checked FIRST so a threading header riding on a
        forwarded chain is not misread as a reply.
      * The RFC-5322 threading headers ``In-Reply-To`` / ``References`` are the
        authoritative reply signal when the caller passes them (a well-behaved client
        sets them only on a reply). Stronger than the subject, so checked next.
      * Otherwise fall back to a leading ``RE:`` subject prefix — the signal available
        today, before the orchestrator wires the headers through.
    """
    if _FORWARD_SUBJECT_RE.match(subject):
        return False
    if in_reply_to.strip() or references.strip():
        return True
    return bool(_REPLY_SUBJECT_RE.match(subject))


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
         query_existing_work (the flow confirms the open-Case link; the classifier
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
    domain_s = _normalise(sender_domain).strip().lower()
    state = _normalise(provider_match_state).strip().lower()
    kinds = {str(k).strip().lower() for k in (attachment_kinds or []) if str(k).strip()}
    filenames = [str(f) for f in (attachment_filenames or []) if str(f).strip()]
    has_atts = bool(has_attachments) or bool(kinds)
    is_reply = _is_reply(subject_s, _normalise(in_reply_to), _normalise(references))

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

    # PROMOTION signals — sender-scoped.
    work_phrases = _match_keywords(work_scope, _WORK_KEYWORDS)
    query_phrases = _match_keywords(work_scope, _QUERY_KEYWORDS)
    billing_phrases = _match_keywords(work_scope, _BILLING_KEYWORDS)
    informal_phrases = _match_keywords(work_scope, _INFORMAL_WORK_KEYWORDS)
    chase_phrases = _match_keywords(work_scope, _CHASE_PHRASES)
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
    # A chase / query trigger (a question OR a send-me-the-report chase).
    query_or_chase = bool(query_phrases) or bool(chase_phrases)

    provider_known = state == PROVIDER_ONE
    has_instruction_doc = bool(kinds & _INSTRUCTION_KINDS)
    has_images = bool(kinds & _IMAGE_KINDS)
    has_report_attachment = _has_report_attachment(filenames)
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
    if digest:
        signals.append("digest_multiple_refs:" + ",".join(sorted(distinct_caserefs)))
    if state in {PROVIDER_ONE, PROVIDER_NONE, PROVIDER_AMBIGUOUS}:
        signals.append(f"provider_match_state:{state}")
    if kinds:
        signals.append("attachment_kinds:" + ",".join(sorted(kinds)))

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
    if (
        not has_atts
        and len(work_phrases) >= 2
        and (body_caseref or body_vrm)
        and not suppress_as_query
    ):
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
    # The classifier proposes query_existing_work; the flow confirms the open-Case link
    # (Case/PO first, then job ref, then VRM; it never auto-links on ambiguity). A chase
    # for a report we owe (TKT-030/031/033) reaches here via ``query_or_chase``.
    if query_or_chase and (has_existing_ref or body_vrm):
        return _result(
            CATEGORY_QUERY,
            SUBTYPE_QUERY_EXISTING_WORK,
            _CONFIDENCE_GOOD,
            "query_with_reference",
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
    if (
        (body_caseref or body_jobref)
        and new_evidence
        and not query_phrases
        and not is_bare_ack_reply
    ):
        images_only = bool(kinds) and kinds.issubset(_IMAGE_KINDS)
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
