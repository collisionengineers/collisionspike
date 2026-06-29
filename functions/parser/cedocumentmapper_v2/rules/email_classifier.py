"""Deterministic inbound-email classifier (Phase 8, Phase A).

A single PURE function — :func:`classify_email` — that reads an inbound email's
already-decoded fields and returns the operator's triage label. It is the Python
engine behind the parser Function's ``POST /classify-email`` route (the strong
signals already live in :mod:`cedocumentmapper_v2.rules.engine`, so re-deriving
them in Power Fx would duplicate and drift). No Dataverse, no network, no LLM —
just the same keyword / phrase / regex matching the rest of the engine uses, so
it is trivially unit-testable.

Taxonomy (two stable, append-only choicesets; see collisionspike ADR-0015):

    category  : receiving_work | query | other
    subtype   : existing_provider_instruction   (RECEIVING WORK · base instruction)
                existing_provider_audit          (RECEIVING WORK · audit re-inspection)
                new_client_work                  (RECEIVING WORK · new client)
                query_existing_work              (QUERIES · about work we did)
                query_new_enquiry                (QUERIES · new enquiry / quote)
                other                            (unidentified — the catch-all)

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

Request fields (all optional; missing ones are treated as empty/absent):

    subject               the email subject line (plain text)
    body                  the email body, ALREADY html-stripped to plain text
    from_address          the sender's email address (informational)
    sender_domain         the sender's domain
    provider_match_state  one | none | ambiguous  (the flow's domain match result)
    attachment_kinds      list of attachment kinds, e.g. ["instruction", "image"]
    has_attachments       bool

Response (a plain dict, JSON-serialisable):

    category          str   one of the three categories
    subtype           str   one of the six subtypes
    confidence        float 0.0–1.0, coarse banding (see _CONFIDENCE_*)
    signals           list  the exact rule ids / phrases that fired (explainable)
    body_vrm          str   first VRM found in subject+body, or ""
    body_caseref      str   first Case/PO found in subject+body, or ""
    contract_version  str   the engine contract tag
"""

from __future__ import annotations

import re
from typing import Any

from cedocumentmapper_v2.rules.engine import (
    VRM_RE,
    detect_audit_signals,
    _match_keywords,
    _WORK_KEYWORDS,
    _QUERY_KEYWORDS,
)

# Contract tag for the classifier response. Kept distinct from the parser's EVA
# contract tag so a consumer can tell a /classify-email envelope apart from a
# /parse envelope.
CONTRACT_VERSION = "cedocumentmapper_v2.0_email_triage"

# Category constants.
CATEGORY_RECEIVING_WORK = "receiving_work"
CATEGORY_QUERY = "query"
CATEGORY_OTHER = "other"

# Subtype constants.
SUBTYPE_EXISTING_PROVIDER_INSTRUCTION = "existing_provider_instruction"
SUBTYPE_EXISTING_PROVIDER_AUDIT = "existing_provider_audit"
SUBTYPE_NEW_CLIENT_WORK = "new_client_work"
SUBTYPE_QUERY_EXISTING_WORK = "query_existing_work"
SUBTYPE_QUERY_NEW_ENQUIRY = "query_new_enquiry"
SUBTYPE_OTHER = "other"

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


def classify_email(
    subject: Any = "",
    body: Any = "",
    from_address: Any = "",
    sender_domain: Any = "",
    provider_match_state: Any = "",
    attachment_kinds: Any = None,
    has_attachments: Any = False,
) -> dict[str, Any]:
    """Classify one inbound email into the triage taxonomy. PURE — no I/O.

    First-match-wins decision tree (see ADR-0015 / the Phase-8 plan):

      0. Auto-reply / bounce marker present, AND no instruction doc -> other
         (abstain-to-other; a quoted OOO chain or a bounce must not read as
         work, even when it happens to carry an image — BUT an attached
         instruction doc is the module's strongest positive signal and overrides
         the abstain, so a real provider instruction whose footer says
         "do not reply" still reaches Rule 1).
      1. Instruction doc attached (necessary but NOT sufficient — the kind is
         extension-derived), UNLESS query-phrased with no work language (suppressed
         -> falls through to the query rules):
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
         provider) -> receiving_work, UNLESS the email is phrased as a query with no
         work language (then fall through to the query rules — a provider chasing a
         report who re-attaches the original photo must not create/touch a work Case).
         A known provider domain ALONE, a bare VRM, or an audit signal from an UNKNOWN
         provider do NOT promote a bare image (a forwarded chain, signature logo, or
         bounced-back photo all match the domain); a known provider only selects the
         subtype (and emits the audit subtype) once another signal corroborates.
      3. No attachment, >=2 work keywords + a body Case/PO or VRM -> receiving_work
         (an instruction typed into the email body).
      4. A query keyword + a body Case/PO or VRM -> query / query_existing_work
         (the flow confirms the open-Case link; the classifier proposes it).
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
    has_atts = bool(has_attachments) or bool(kinds)

    haystack = f"{subject_s}\n{body_s}"

    # Signals are accumulated for explainability regardless of which rule wins.
    work_phrases = _match_keywords(haystack, _WORK_KEYWORDS)
    query_phrases = _match_keywords(haystack, _QUERY_KEYWORDS)
    is_audit, audit_phrases = detect_audit_signals(haystack)
    auto_reply_markers = _is_auto_reply(haystack)
    body_vrm = _first_match(VRM_RE, haystack)
    body_caseref = _first_match(CASEREF_RE, haystack)

    provider_known = state == PROVIDER_ONE
    has_instruction_doc = bool(kinds & _INSTRUCTION_KINDS)
    has_images = bool(kinds & _IMAGE_KINDS)

    signals: list[str] = []
    if work_phrases:
        signals.append("work_keywords:" + ",".join(work_phrases))
    if query_phrases:
        signals.append("query_keywords:" + ",".join(query_phrases))
    if audit_phrases:
        signals.append("audit_phrases:" + ",".join(audit_phrases))
    if auto_reply_markers:
        signals.append("auto_reply:" + ",".join(auto_reply_markers))
    if body_caseref:
        signals.append(f"body_caseref:{body_caseref}")
    if body_vrm:
        signals.append(f"body_vrm:{body_vrm}")
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
            "body_vrm": body_vrm,
            "body_caseref": body_caseref,
            "contract_version": CONTRACT_VERSION,
        }

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
    # A query-phrased email that merely re-attaches an instruction doc (query wording,
    # no work phrase) is SUPPRESSED here and falls through to the query rules (exactly
    # as Rule 2 does for images). With no corroboration at all the doc is flagged
    # ``uncorroborated_instruction_doc`` and falls through (abstain-to-other).
    if has_instruction_doc:
        suppress_as_query = bool(query_phrases) and not work_phrases
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
    # subtype — so an audit-shaped image from an unknown provider abstains. A query
    # email that merely re-attaches the original photo (query phrasing, no work phrase)
    # falls through to the query rules (abstain bias; ADR-0015). An instruction doc was
    # already handled at Rule 1.
    if (
        has_images
        and (work_phrases or body_caseref or (is_audit and provider_known))
        and not (query_phrases and not work_phrases)
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
    # tipping a query into work (abstain-to-other bias).
    if not has_atts and len(work_phrases) >= 2 and (body_caseref or body_vrm):
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

    # --- Rule 4: a question that names a Case/PO or VRM — about work we did ------
    # The classifier proposes query_existing_work; the flow confirms the open-Case
    # link by Case/PO first, VRM as fallback (it never auto-links on ambiguity).
    if query_phrases and (body_caseref or body_vrm):
        return _result(
            CATEGORY_QUERY,
            SUBTYPE_QUERY_EXISTING_WORK,
            _CONFIDENCE_GOOD,
            "query_with_reference",
        )

    # --- Rule 5: a question with no reference — existing if known, else enquiry -
    if query_phrases:
        subtype = (
            SUBTYPE_QUERY_EXISTING_WORK if provider_known else SUBTYPE_QUERY_NEW_ENQUIRY
        )
        return _result(
            CATEGORY_QUERY,
            subtype,
            _CONFIDENCE_WEAK,
            "query_keyword_only",
        )

    # --- Rule 6: abstain — unidentified email lands in the catch-all bucket -----
    return _result(
        CATEGORY_OTHER,
        SUBTYPE_OTHER,
        _CONFIDENCE_ABSTAIN,
        "abstain_to_other",
    )
