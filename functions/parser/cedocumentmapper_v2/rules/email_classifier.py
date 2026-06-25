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

# Case/PO matcher. The Case/PO is a 4-char internal Principal code + 2-digit year
# + 3-digit provider case number (e.g. "CCPY26050"), optionally carrying the "A."
# audit prefix (e.g. "A.PCH261269"). Anchored to that exact shape — NOT a bare
# alphanumeric run — so a phone number or postcode in the body cannot masquerade
# as a Case/PO. Case-insensitive; tolerates an optional space after the "A.".
CASEREF_RE = re.compile(
    r"\b(?:A\.\s?)?[A-Z]{2,4}\d{2}\d{3,4}\b",
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

      0. Auto-reply / bounce marker present  -> other
         (abstain-to-other; a quoted OOO chain or a bounce must not read as
         work, even when it happens to carry an image).
      1. Instruction doc attached            -> receiving_work
         (audit | existing-provider | new-client by audit phrases / provider).
      2. Images + (provider known OR work keyword) -> receiving_work, UNLESS the
         email is phrased as a query with no work language (then fall through to
         the query rules — a provider chasing a report who re-attaches the
         original photo must not create/touch a work Case).
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
    # back). Either way it is not a fresh instruction, so abstain to ``other``
    # rather than risk a wrong receiving-work label (abstain-to-other; ADR-0015
    # Risk 2). This guard runs BEFORE the image/work rules so an auto-reply with an
    # image cannot slip through to Rule 2 and read as work.
    if auto_reply_markers:
        return _result(
            CATEGORY_OTHER,
            SUBTYPE_OTHER,
            _CONFIDENCE_ABSTAIN,
            "auto_reply_marker",
        )

    # --- Rule 1: an instruction document is the single strongest work signal ---
    if has_instruction_doc:
        if is_audit:
            return _result(
                CATEGORY_RECEIVING_WORK,
                SUBTYPE_EXISTING_PROVIDER_AUDIT,
                _CONFIDENCE_STRONG,
                "instruction_doc_audit",
            )
        if provider_known:
            return _result(
                CATEGORY_RECEIVING_WORK,
                SUBTYPE_EXISTING_PROVIDER_INSTRUCTION,
                _CONFIDENCE_STRONG,
                "instruction_doc_existing_provider",
            )
        return _result(
            CATEGORY_RECEIVING_WORK,
            SUBTYPE_NEW_CLIENT_WORK,
            _CONFIDENCE_GOOD,
            "instruction_doc_new_client",
        )

    # --- Rule 2: images + a provider or work language confirms work -------------
    # An attached image plus a known provider OR instruction language reads as a
    # fresh instruction (a new client's photos, or a provider's photos with a
    # "please inspect"). BUT a query email that merely re-attaches the original
    # photo — query phrasing, no work phrase, no instruction doc (Rule 1 already
    # consumed those) — must NOT be promoted to work on the provider match alone:
    # a provider chasing a report who re-sends the photo would otherwise create or
    # touch a Case. In that one case fall through to the query rules (abstain bias;
    # ADR-0015). A genuine instruction still wins: a work phrase here keeps Rule 2,
    # and an instruction doc already classified at Rule 1.
    if has_images and (provider_known or work_phrases) and not (
        query_phrases and not work_phrases
    ):
        subtype = (
            SUBTYPE_EXISTING_PROVIDER_INSTRUCTION
            if provider_known
            else SUBTYPE_NEW_CLIENT_WORK
        )
        return _result(
            CATEGORY_RECEIVING_WORK,
            subtype,
            _CONFIDENCE_GOOD,
            "images_with_work_signal",
        )

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
