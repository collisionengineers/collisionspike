from __future__ import annotations

import difflib
import re
from datetime import datetime
from dataclasses import replace
from typing import Any
from cedocumentmapper_v2.domain.models import (
    DocumentModel,
    DocumentLine,
    FieldExtraction,
    SourceSpan,
    ExtractionIssue,
    FieldKey,
    ExtractedRecord,
    ProviderMatch,
    FIELD_ORDER,
)
from cedocumentmapper_v2.normalization import (
    normalize_vrm,
    normalize_vin,
    normalize_mileage,
    normalize_date,
    normalize_vat_status,
    normalize_mileage_unit,
    normalize_address,
    normalize_telephone,
    normalize_email,
    validate_fields,
)
from cedocumentmapper_v2.normalization.normalizers import TELEPHONE_RE, EMAIL_RE
from cedocumentmapper_v2.rules.triage_rules import load_triage_rules


def clean_val(value: str) -> str:
    """Clean a value matching v1 clean_value."""
    value = value.replace("\xa0", " ").replace("\u00a0", " ")
    value = value.replace("\r", " ").replace("\t", " ")
    value = re.sub(r"^\|\s*", "", value)
    value = re.sub(r"[ ]{2,}", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip(" :\n")


def fuzzy_find_label(lines: list[DocumentLine], label: str, threshold: float = 0.8) -> tuple[int, DocumentLine, float] | None:
    """Search for a label in document lines, supporting exact, substring, and fuzzy matching.
    
    Returns (line_idx, DocumentLine, confidence) if found, otherwise None.
    """
    target = label.lower().strip()
    
    # 1. Exact or substring match (1.0 confidence)
    for idx, line in enumerate(lines):
        line_txt = line.text.lower().strip()
        if target in line_txt or line_txt == target or line_txt.rstrip(":") == target:
            return idx, line, 1.0

    # 2. Fuzzy match using SequenceMatcher
    effective_threshold = max(threshold, 0.85) if len(target) < 15 else threshold
    best_ratio = 0.0
    best_match = None
    for idx, line in enumerate(lines):
        line_txt = line.text.lower().strip()
        # Slide a window of length target over line_txt if line_txt is longer
        if len(line_txt) > len(target) + 5:
            # Check substrings of similar length
            words = line_txt.split()
            target_words_len = len(target.split())
            for i in range(len(words) - target_words_len + 1):
                sub = " ".join(words[i:i + target_words_len])
                ratio = difflib.SequenceMatcher(None, target, sub).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = (idx, line)
        else:
            ratio = difflib.SequenceMatcher(None, target, line_txt).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = (idx, line)

    if best_ratio >= effective_threshold and best_match is not None:
        return best_match[0], best_match[1], best_ratio

    return None


UK_POSTCODE_RE = re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[ABD-HJLNP-UW-Z]{2}\b", re.IGNORECASE)
DATE_RE = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{2,4}|"
    r"\d{4}-\d{1,2}-\d{1,2})\b",
    re.IGNORECASE,
)
VRM_RE = re.compile(
    r"\b(?!VAT\b)(?!TEL\b)(?!REF\b)([A-Z]{2}\d{2}\s?[A-Z]{3}|[A-Z]\d{1,3}\s?[A-Z]{3}|"
    r"[A-Z]{3}\s?\d{1,3}[A-Z]?|[A-Z]{1,3}\s?\d{1,4})\b",
    re.IGNORECASE,
)


# Month / day-of-week words (collisionspike TKT-085): a date word must never be
# accepted as a registration mark. The live audit case A.PCH26003 logged its VRM
# as "OCTOBER" — a month word captured near a "registration" label. Every VRM
# regex in this module requires digits, so the guard is defence-in-depth for the
# labelled-field / normalization paths (and any future shape loosening). Includes
# the common 3-4 letter abbreviations; "MAY"/"JAN" style abbreviations are
# accepted as the FULL candidate only (a real dateless plate is letters+digits,
# so a bare month word is never a plate).
_VRM_MONTH_DAY_WORDS = frozenset({
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST",
    "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
    "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
    "JAN", "FEB", "MAR", "APR", "JUN", "JUL", "AUG", "SEP", "SEPT", "OCT", "NOV", "DEC",
})

# Common English FUNCTION words that the loose dateless shape's 1-3 letter alpha
# head can accidentally spell out of running prose (collisionspike TKT-100: the
# QDOS footer's "Offices 1 and 2, 1A King Street" surfaced "AND2" as a live VRM).
# A loose candidate whose alpha head is one of these is prose, not a plate.
# Deliberately restricted to function words nobody buys as a personalised-plate
# head — real dateless heads like "VAN"/"JET"/"SAM" are NOT listed.
_VRM_LOOSE_ALPHA_STOPWORDS = frozenset({
    "AND", "THE", "FOR", "NOT", "BUT", "ARE", "WAS", "OUR", "YOU", "ALL",
    "ANY", "HAS", "HAD", "PER", "VIA",
})

# The current UK postcode AREA prefixes (the alphabetic head of a postcode).
# Mirrors the TS filter's POSTCODE_AREAS (packages/domain vrm-filter.ts). Used by
# the email sniff's tight-anchor rule (collisionspike TKT-071): a loose dateless
# candidate whose letters are a postcode area (HD4110, LS8) reads as a postcode
# fragment / provider job ref unless a VRM anchor word IMMEDIATELY precedes it.
POSTCODE_AREAS = frozenset({
    "AB", "AL", "B", "BA", "BB", "BD", "BH", "BL", "BN", "BR", "BS", "BT", "CA", "CB", "CF", "CH",
    "CM", "CO", "CR", "CT", "CV", "CW", "DA", "DD", "DE", "DG", "DH", "DL", "DN", "DT", "DY", "E",
    "EC", "EH", "EN", "EX", "FK", "FY", "G", "GL", "GU", "GY", "HA", "HD", "HG", "HP", "HR", "HS",
    "HU", "HX", "IG", "IM", "IP", "IV", "JE", "KA", "KT", "KW", "KY", "L", "LA", "LD", "LE", "LL",
    "LN", "LS", "LU", "M", "ME", "MK", "ML", "N", "NE", "NG", "NN", "NP", "NR", "NW", "OL", "OX",
    "PA", "PE", "PH", "PL", "PO", "PR", "RG", "RH", "RM", "S", "SA", "SE", "SG", "SK", "SL", "SM",
    "SN", "SO", "SP", "SR", "SS", "ST", "SW", "SY", "TA", "TD", "TF", "TN", "TQ", "TR", "TS", "TW",
    "UB", "W", "WA", "WC", "WD", "WF", "WN", "WR", "WS", "WV", "YO", "ZE",
})


def vrm_candidate_is_bad(candidate: str, context: str) -> bool:
    """True when a VRM-shaped ``candidate`` should be REJECTED.

    Shared guard for BOTH the loose /parse fallback VRM extraction (RuleEngine)
    and the email classifier's canonical ``body_vrm`` sniff (collisionspike #7),
    so the two never drift. Rejects: a too-short compact that is not a full
    letter-digit-letter plate; a candidate that is actually the OUTWARD half of a
    UK postcode (immediately followed by an inward ``\\d[A-Z]{2}`` code, e.g.
    ``LS8 2AB``); bare label words; a month / day-of-week word (TKT-085 — the
    live "OCTOBER" registration); and a loose dateless candidate whose alpha head
    is a common English function word (TKT-100 — the QDOS "AND2").
    ``RuleEngine._vrm_candidate_is_bad`` delegates here.
    """
    compact = normalize_vrm(candidate)
    if len(compact) < 5 and not re.fullmatch(r"[A-Z]{1,3}\d{1,3}[A-Z]{1,3}", compact):
        return True
    if re.search(rf"\b{re.escape(candidate)}\s*\d[ABD-HJLNP-UW-Z]{{2}}\b", context, re.IGNORECASE):
        return True
    if compact in {"CLIENT", "VEHICLE", "REG", "MODEL"}:
        return True
    # TKT-085: a month or day-of-week word is a date fragment, never a mark.
    if compact in _VRM_MONTH_DAY_WORDS:
        return True
    # TKT-100: a LOOSE dateless candidate (letters+digits) whose alpha head is a
    # common English function word ("and 2" -> AND2) is running prose, not a plate.
    loose = re.fullmatch(r"([A-Z]{1,3})\d{1,4}", compact)
    if loose and loose.group(1) in _VRM_LOOSE_ALPHA_STOPWORDS:
        return True
    return False


# --- Shared reference money guard (collisionspike TKT-103 / TKT-136) --------- #
# A currency amount is exactly the structured-ref shape ("768.00" = digits + '.'
# + digits), so the Tractable "AI Quote: £768.00" surfaced as a job reference on
# the CLASSIFIER path (TKT-103) and money values could equally mint the /parse
# fallback reference (TKT-136). ONE definition, shared by BOTH
# ``rules/email_classifier._job_reference`` and ``RuleEngine._fallback_reference``,
# so the two guards can never drift (the classifier aliases these). A token whose
# dotted tail is exactly TWO decimal digits is a money value, never a ref (every
# real dotted ref in the corpus carries a 1- or 3-4-digit sequence suffix —
# "206848.001", "45391_1" — never .NN). Comma-grouped thousands included.
MONEY_TOKEN_RE = re.compile(r"^\d{1,3}(?:,\d{3})*\.\d{2}$")
# A currency marker immediately before the token ("£768.00", "GBP 768.00") also
# disqualifies it, whatever the decimal shape.
CURRENCY_BEFORE_RE = re.compile(r"(?:[£$€]|\bGBP|\bEUR|\bUSD)\s*$", re.IGNORECASE)


def reference_candidate_is_money(token: str, preceding: str = "") -> bool:
    """True when a reference-shaped ``token`` is actually a MONEY value.

    ``preceding`` is the raw text immediately BEFORE the token (the classifier
    passes an ~8-char window; the /parse tiers pass the line text up to the
    match), so a currency marker just before the token ("£ 768.00", "GBP 487")
    disqualifies it whatever its decimal shape. The /parse label tiers capture
    free text, so a currency marker glued INTO the value itself ("£768.00") is
    stripped before the shape test — a no-op for the classifier's regex-captured
    tokens, which can never start with a currency mark.
    """
    compact = re.sub(r"\s+", "", token or "")
    inner = re.sub(r"^(?:[£$€]|GBP|EUR|USD)", "", compact, flags=re.IGNORECASE)
    if MONEY_TOKEN_RE.fullmatch(inner):
        return True
    # A currency CODE can be captured as the token's own alpha head
    # ("GBP 487.32" -> "GBP487" via the classifier's spaced-principal arm).
    if re.match(r"^(?:GBP|EUR|USD)\d", compact, re.IGNORECASE):
        return True
    return bool(CURRENCY_BEFORE_RE.search(preceding or ""))


# --- Reference fragment-plausibility guard (collisionspike TKT-136) ---------- #
# The live case_ref "RIGERANT R1234YF" was a refrigerant SPEC fragment: the
# fuzzy "ref" label matched the head of "REFRIGERANT R1234YF 650g" and the tail
# of the parts line was minted as the reference. A candidate reference VALUE
# that reads as prose / a spec-list fragment is rejected:
#   * any token shaped like a unit quantity ("650g", "2.5kg", "0.7hours") marks
#     a parts/spec line;
#   * a MULTI-word value whose first token carries no digit and is not a short
#     ALL-CAPS principal/prefix code ("PHA 5013" passes; "RIGERANT R1234YF" and
#     title-case prose heads do not) is narrative, not a reference.
# Single-token values (the overwhelmingly common real-ref shape — "REB/46487/1",
# "206848.001", "CCPY26050") are untouched apart from the unit-token test.
SPEC_UNIT_TOKEN_RE = re.compile(
    r"^\d+(?:\.\d+)?(?:g|kg|mg|ml|ltr|litres?|liters?|mm|cm|km|cc|kw|bhp|psi|bar|hrs?|hours?)$",
    re.IGNORECASE,
)
REF_PREFIX_HEAD_RE = re.compile(r"^[A-Z]{1,6}[.:#-]?$")


def reference_candidate_is_fragment(value: str) -> bool:
    """True when a candidate reference VALUE reads as a prose/spec fragment."""
    tokens = (value or "").split()
    if not tokens:
        return False
    if any(SPEC_UNIT_TOKEN_RE.fullmatch(t) for t in tokens):
        return True
    if len(tokens) < 2:
        return False
    head = tokens[0]
    if not re.search(r"\d", head) and not REF_PREFIX_HEAD_RE.fullmatch(head):
        return True
    return False


# Canonical value emitted for the inspection address when the document states the
# vehicle will be assessed from images / on a desktop basis rather than at a
# physical location. Matches the EVA contract convention (see docs/testing
# testjsons and the queue/case model: "AX inspection=Image Based Assessment").
IMAGE_BASED_ASSESSMENT = "Image Based Assessment"

# Phrases (case-insensitive) that signal an image-based / desktop assessment
# statement in an inspection-address field. These are NORMALISED to the canonical
# IMAGE_BASED_ASSESSMENT value instead of being blanked as junk narrative.
_IMAGE_BASED_PHRASES = (
    "image-based assessment",
    "image based assessment",
    "image-based",
    "image based",
    "desktop assessment",
    "desktop inspection",
    "desktop based",
    "desktop-based",
    "electronic basis",
)


# Our OWN e-mail domain (Collision Engineers). Instruction documents and covering
# emails routinely quote our intake mailboxes (engineers@ / info@ / desk@
# collisionengineers.co.uk) and the noreply. website-form subdomain, so any
# candidate address at this domain — or a subdomain of it — is OUR contact
# detail, never the claimant's. Matched with a suffix rule in
# RuleEngine._is_non_claimant_email so subdomains are covered too.
_OWN_EMAIL_DOMAINS: tuple[str, ...] = ("collisionengineers.co.uk",)


# --- Externalized phrase data (collisionspike rules-engine-v2 plan, Phase 5) ---
# Every flat keyword/phrase collection from here down is now data, not code: it
# lives in the schema-validated resources/triage-rules.json (loader + schema:
# rules/triage_rules.py / resources/triage-rules.schema.json), loaded ONCE per
# process and validated on that load. The comment above each constant is
# RETAINED verbatim -- it records the WHY (mined real-email provenance, the
# precision discipline, deliberate omissions) that the JSON alone cannot
# carry. To add/remove/reorder a phrase, edit the JSON; the tuple literal that
# used to live at each assignment below is gone, so editing IT would do
# nothing. Regexes, rule ordering, confidence bands and suppression logic are
# all still Python, unchanged, below/around these constants.
_RULES = load_triage_rules()


# --- Shared VRM context/anchor guard data (collisionspike TKT-071/#7/TKT-136) - #
# These previously lived ONLY in rules/email_classifier.py (the classifier's
# canonical ``body_vrm`` sniff). TKT-136's scope addendum ports them to the
# /parse DOCUMENT path too, so junk VRMs cannot re-enter via documents; the
# canonical definitions now live HERE and the classifier imports/aliases them —
# one source, no drift.
#
# Words that must sit near a loose/dateless candidate for it to count as a VRM.
VRM_CONTEXT_WORDS: tuple[str, ...] = (
    "reg",  # also covers "registration"
    "registration",
    "vrm",
    "vehicle",
    "plate",
)
# How far either side of a candidate to look for a context word / postcode.
VRM_CONTEXT_WINDOW = 30
# TIGHT anchor (collisionspike TKT-071): when a loose candidate's letters are a
# UK postcode AREA (HD4110, LS8 — see POSTCODE_AREAS), an anchor word merely
# NEARBY is not enough (a letter of instruction mentions "vehicle" everywhere
# and quotes the provider's own job ref, which is exactly postcode-shaped:
# HD4110). The anchor must IMMEDIATELY precede the candidate ("reg HD4110",
# "registration: HD4110") — this many chars of lookbehind, enough for
# "registration:  " plus separators.
VRM_TIGHT_ANCHOR_WINDOW = 16
VRM_TIGHT_ANCHOR_RE = re.compile(
    r"(?:reg(?:istration)?|vrm|vehicle|plate)\s*(?:no|number|mark)?\s*[:.\-#]?\s*$",
    re.IGNORECASE,
)
# Common English words a WELL-FORMED VRM's 3-letter alpha group can accidentally
# spell out of natural-language / model text ("Model X5 now …" -> "X5 NOW").
# Deliberately small + conservative so real plates are never dropped (#7/F162).
_VRM_STOPWORD_TRIGRAMS: frozenset[str] = _RULES.vrm_stopword_trigrams


def loose_alpha_head_is_postcode_area(candidate: str) -> bool:
    """True when the loose candidate's letter head is a UK postcode AREA prefix
    (HD, LS, G, ...) — the shape a postcode fragment or a provider job ref
    (HD4110) shares, requiring the TIGHT anchor instead of the nearby one."""
    m = re.match(r"^([A-Z]{1,3})", re.sub(r"\s+", "", candidate).upper())
    return bool(m) and m.group(1) in POSTCODE_AREAS


def wellformed_trigram_is_stopword(candidate: str) -> bool:
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


def vrm_document_candidate_is_bad(
    candidate: str, text: str, start: int, end: int, anchor_text: str | None = None
) -> bool:
    """Document-path VRM guard (collisionspike TKT-136 scope addendum).

    The shared :func:`vrm_candidate_is_bad` window checks PLUS the two guards
    that previously protected only the classifier's ``body_vrm``:

      * the TKT-071 TIGHT anchor — a loose/dateless candidate whose alpha head
        is a UK postcode AREA (HD4110) is accepted only when a reg/vrm/vehicle/
        plate anchor IMMEDIATELY precedes it in ``text``;
      * the #7/F162 stop-word TRIGRAM — a well-formed candidate whose 3-letter
        alpha group spells a common English word is rejected when no VRM context
        word sits within ``VRM_CONTEXT_WINDOW`` of it.

    ``start``/``end`` are the candidate's span within ``text`` (a line or the
    whole document text), so the anchor check reads what actually precedes it.
    ``anchor_text`` overrides the tight anchor's default 16-char lookbehind —
    the LABELLED tier passes the fuzzy-matched VRM label line itself, because a
    label like "Vehicle Registration Number" is the anchor by construction but
    is longer than the flowing-text window.
    """
    window = text[max(0, start - VRM_CONTEXT_WINDOW):end + VRM_CONTEXT_WINDOW]
    if vrm_candidate_is_bad(candidate, window):
        return True
    compact = re.sub(r"\s+", "", candidate or "").upper()
    if re.fullmatch(r"[A-Z]{1,3}\d{1,4}", compact) and loose_alpha_head_is_postcode_area(candidate):
        before = (
            anchor_text
            if anchor_text is not None
            else text[max(0, start - VRM_TIGHT_ANCHOR_WINDOW):start]
        )
        if not VRM_TIGHT_ANCHOR_RE.search(before):
            return True
    if wellformed_trigram_is_stopword(candidate):
        lowered_window = window.lower()
        if not any(word in lowered_window for word in VRM_CONTEXT_WORDS):
            return True
    return False


# Phrases (case-insensitive) that signal an AUDIT instruction — CE is asked to
# perform a SECOND, independent inspection that audits a THIRD-PARTY engineer's
# ORIGINAL report (a distinct case-type, marked by an "A." Case/PO prefix; see
# collisionspike ADR-0014). This is NOT the engineer-report overlay (CE's own
# CNX/EVA report). Grounded in real PCH audit instructions — the matching NORMAL
# instruction in the same corpus contained NONE of these. High-precision on
# purpose: a false positive would mis-mark a standard case as an audit and
# corrupt its Case/PO numbering, so we anchor to specific phrases, never the
# bare word "audit".
_AUDIT_PHRASES: tuple[str, ...] = _RULES.audit_phrases


# Phrases (case-insensitive) that signal a DUAL "report + audit report"
# instruction -- one letter commissioning BOTH a standard engineer's report AND
# an audit of the client/bodyshop report (the QDOS "ENGINEER NOTIFICATION
# (REPORT + AUDIT REPORT)" template; verified identical across the real
# QDOS261253/261530/261572/261608 letters, whether the audit later resolved
# repairable or total-loss). The dual form matters downstream: a dual letter
# mints ONE case from the provider's NORMAL sequence (the audit deliverable's
# A./AP. ID is DERIVED from that same number at review), whereas a standalone
# audit instruction mints from the marker's own sequence (collisionspike
# ADR-0021). Same high-precision discipline as _AUDIT_PHRASES.
_DUAL_REPORT_AUDIT_PHRASES: tuple[str, ...] = _RULES.dual_report_audit_phrases


# Phrases (case-insensitive) that signal a DIMINUTION in Value engagement -- a
# distinct case-type (D. Case/PO marker, e.g. D.PCH26190), NOT an audit
# subtype. Anchored two-word phrases, never the bare word "diminution",
# mirroring the _AUDIT_PHRASES discipline. Grounded so far only in CE-side
# artefacts (the D.PCH26190 case folder's own documents and the current product
# scope's "Diminution in Value Report") -- NO real inbound
# diminution instruction email has been captured yet, so downstream treats a
# diminution hit as REVIEW-FIRST (case-type surfaced for a person; no D.
# Case/PO is minted from content alone until detection is grounded on a real
# example). Extend when the operator supplies one.
_DIMINUTION_PHRASES: tuple[str, ...] = _RULES.diminution_phrases


# Phrases (case-insensitive) that signal an email is INSTRUCTING new work — the
# sender is asking Collision Engineers to carry out an inspection / produce a
# report. Mirrors the high-precision _AUDIT_PHRASES discipline: anchored to
# instruction language ("please inspect", "instructed to") rather than any bare
# word that could appear in a question about past work. Used by the email
# classifier alongside attachment/provider signals; a body that fires several of
# these (plus a Case/PO or VRM) is treated as a typed-in-body instruction even
# with no attachment. Kept deliberately conservative so an ambiguous email
# abstains to the "other" bucket rather than getting a wrong receiving-work label.
# Also carries the collisionspike TKT-036 instruction subject/attachment cues:
# real provider instructions arrive with these in the subject ("New eng ins") or
# the attachment filename ("To Engineer with instructions"), not always a
# "please inspect" verb in the body. Same precision discipline: these are
# instruction-specific phrases, not bare words. (See resources/triage-rules.json
# -> work_keywords for the phrase list itself.)
_WORK_KEYWORDS: tuple[str, ...] = _RULES.work_keywords


# Phrases (case-insensitive) that signal an INVOICE / BILLING request — the sender
# is asking US to send (or chasing) the invoice/fee for work ALREADY carried out.
# This is NOT new work and NOT a generic query: an email asking for the invoice,
# typically with our own engineer's report attached, must route to the billing
# bucket, never mint a new Case (collisionspike TKT-037). Consulted only after the
# work rules, like _QUERY_KEYWORDS, so an email that both bills and instructs reads
# as work first.
# DELIBERATELY REQUEST-SHAPED: a remittance advice ("payment is on its way") or a
# statement that merely mentions "invoice" is NOT a billing request — only an
# imperative asking US to send/provide our invoice or fee note is. Anchored to the
# request verbs so an inbound payment advice abstains to other, not billing.
_BILLING_KEYWORDS: tuple[str, ...] = _RULES.billing_keywords


# Phrases (case-insensitive) that signal an INFORMAL work request — a sender who
# wants us to look at / report on a vehicle but does not use the formal instruction
# wording in _WORK_KEYWORDS (collisionspike TKT-040). DELIBERATELY WEAKER than
# _WORK_KEYWORDS: an informal phrase only promotes when it is corroborated by a real
# job identifier (a Case/PO, job ref, or VRM) AND images — informal wording alone
# must still abstain, to preserve the abstain-to-other bias.
# Also carries the collisionspike TKT-040 informal triage / initial-assessment
# work requests (a provider sends damage photos and asks for a
# roadworthiness/repairability view before the formal instruction) — those
# promote ONLY with images + a job identifier, same as every other entry here.
_INFORMAL_WORK_KEYWORDS: tuple[str, ...] = _RULES.informal_work_keywords


# Phrases (case-insensitive) that signal an email is ASKING A QUESTION rather than
# instructing work — a chase for a report we owe, a status question, or a cold
# enquiry / request for a quote. Same precision discipline as _WORK_KEYWORDS.
# The classifier uses these only after the work rules have failed, so an email
# that both instructs and asks a question still reads as work first.
# Also carries: collisionspike #8's broader chase / status / advice wording
# (real provider chases like "can we please have an update on our client"
# matched NO keyword and fell through to 'other'; these are deliberately NOT
# instruction wording, so the work rules still win an email that both instructs
# and asks); and collisionspike TKT-039's report-support / dispute queries (a
# client asking us to justify a report we already produced — questions about
# EXISTING work).
_QUERY_KEYWORDS: tuple[str, ...] = _RULES.query_keywords


# High-precision CHASE phrases (collisionspike TKT-030/031/033): the sender is asking
# us to SEND a report we already owe, or noting they have heard nothing. These recap
# the original instruction ("...we instructed you to inspect and prepare a report,
# but heard nothing — please send your report"), so the email carries strong work
# language yet is NOT new work. A genuine NEW instruction never asks us to "provide
# your report" / says it "heard nothing" — so a chase phrase SUPPRESSES the work rules
# (handled in the classifier) and routes the email to the query side. Anchored to
# send-me-the-existing-report wording; deliberately excludes "provide a report"
# (that is an instruction TO produce one).
_CHASE_PHRASES: tuple[str, ...] = _RULES.chase_phrases


# Case-summary / digest markers (collisionspike TKT-029): an email that is a RECAP of
# instructions already sent (the per-case detail is in an attached summary, not a fresh
# instruction). High-precision recap wording so a genuine instruction is not suppressed.
_SUMMARY_MARKERS: tuple[str, ...] = _RULES.summary_markers


# Phrases (case-insensitive) that signal the sender is CANCELLING / withdrawing an
# existing instruction, claim or inspection outright — collisionspike TKT-041 /
# taxonomy-v2. Mined from the 13 real TKT-041 cancellation emails: roughly half are
# auto-generated claim-system notices ("Please be advised that claim ... has been
# cancelled ... any outstanding instructions can be disregarded"; "Please cancel any
# previous instructions ... as the repair is cancelled"; subject "Claim closed
# notification"), the other half are a person typing a short cancel request ("please
# cancel this instruction", "close this one off - client has cancelled instructions",
# "SB20 CMY IS TO BE CANCELLED PLEASE", "please cancel the instructions ... for the
# mentioned client"). One real example ("place this file on hold ... until you receive
# further instructions") used HOLD wording with no "cancel" word at all — deliberately
# NOT mined in here, since a hold/pause is not the same claim as an outright
# cancellation; it would need its own signal if it becomes worth distinguishing.
# Deliberately includes the bare words "cancelled" / "cancellation" (several of the
# real emails say only that, with no other wording) — precision is instead carried by
# the SENDER-WRITTEN-only scope the classifier applies (a cancellation phrase quoted
# out of an OLDER message must not cancel a DIFFERENT, currently-live thread) plus a
# cheap negation guard for "not cancelled" (see ``_CANCELLATION_NEGATION_RE`` in
# email_classifier.py). NOT exhaustive — a cancellation phrased without any of these
# words (e.g. a bare "please stop work") will still abstain; extend this tuple as real
# misses turn up.
_CANCELLATION_PHRASES: tuple[str, ...] = _RULES.cancellation_phrases


# Phrases (case-insensitive) that signal an INBOUND payment notification — a
# remittance advice or payment-transfer notice for work we already did
# (collisionspike TKT-105 / TKT-120). The MIRROR-IMAGE of _BILLING_KEYWORDS: those
# are a REQUEST for our invoice; these say money has been / is being sent. A
# remittance advice typically arrives with a payment PDF whose extension-derived
# attachment kind is "instruction", so without this signal it would promote to
# receiving_work at Rule 1 and mint a Case (the live TKT-105 failure). Grounded on
# the real Express Solicitors remittance ("Please see attached remittance advice,
# the funds will be in your nominated account") and the FAIRWAY LEGAL transfer
# (TKT-120). Anchored payment-statement wording, never the bare word "payment".
_PAYMENT_PHRASES: tuple[str, ...] = _RULES.payment_phrases


# Phrases (case-insensitive) that signal PRE-INSTRUCTION directions — the sender is
# telling us what to do WHEN the official instruction later arrives (collisionspike
# TKT-084): not yet an instruction (no case may be minted), not noise. Grounded on
# the real Accident Specialists email ("When you receive an instruction from RJ on
# this one please hold off from obtaining images..."). Every phrase is anchored to
# a FUTURE-instruction reference — never a bare direction verb like "hold off" —
# so a chase/hold request about live work (TKT-041's hold example) and a genuine
# instruction email cannot trip it. The classifier additionally requires an
# identifier (VRM or reference) and the ABSENCE of an attached instruction doc.
_PRE_INSTRUCTION_PHRASES: tuple[str, ...] = _RULES.pre_instruction_phrases


def _match_keywords(text: str, phrases: tuple[str, ...]) -> tuple[str, ...]:
    """Return the subset of ``phrases`` present (case-insensitive) in ``text``.

    Shared helper for the keyword tuples above, mirroring the matching done in
    :func:`detect_audit_signals` so every classifier decision can list exactly
    which phrases fired (explainability). Empty/None text -> no matches.
    """
    if not text:
        return ()
    haystack = text.lower()
    return tuple(phrase for phrase in phrases if phrase in haystack)


def detect_audit_signals(text: str) -> tuple[bool, tuple[str, ...]]:
    """Return ``(is_audit, signals)`` for an instruction's plain text.

    Content-based (the engine cannot see the real filename — the Function parses
    decoded bytes from a temp file with a random name), conservative, and
    explainable: ``signals`` lists exactly which phrases fired so the decision is
    auditable (surfaced to the Action Log). Empty/None text -> not an audit.
    """
    if not text:
        return False, ()
    haystack = text.lower()
    signals = tuple(phrase for phrase in _AUDIT_PHRASES if phrase in haystack)
    return bool(signals), signals


def detect_case_type_signals(text: str) -> tuple[str | None, bool, tuple[str, ...]]:
    """Return ``(case_type, dual, signals)`` for an instruction's plain text.

    The content-derived case-type decision (collisionspike ADR-0021), layered on
    :func:`detect_audit_signals`:

    * a dual "report + audit report" phrase -> ``("audit", True, ...)`` -- one
      letter commissioning both deliverables (the QDOS template);
    * audit phrases alone -> ``("audit", False, ...)`` -- a standalone audit
      instruction (the PCH pattern);
    * a diminution phrase (and no audit signal) -> ``("diminution", False, ...)``;
    * nothing -> ``(None, False, ())``.

    ``audit_total_loss`` is NEVER emitted here -- the repairable vs total-loss
    split is not knowable from the instruction (the real QDOS letters are
    byte-identical either way); it is a review-time decision read back from an
    ``AP.``-marked reference only (see detection/case_type.py). Precedence when
    signals collide: dual > audit > diminution -- the audit phrase set is
    grounded in real corpus; diminution is conservative (see
    ``_DIMINUTION_PHRASES``) so an ambiguous letter lands as audit for a person
    to correct rather than guessing the rarer type. Signals list exactly which
    phrases fired (explainable / Action-Logged). Empty/None text -> no type.
    """
    if not text:
        return None, False, ()
    haystack = text.lower()
    audit_hits = tuple(p for p in _AUDIT_PHRASES if p in haystack)
    dual_hits = tuple(p for p in _DUAL_REPORT_AUDIT_PHRASES if p in haystack)
    diminution_hits = tuple(p for p in _DIMINUTION_PHRASES if p in haystack)
    if dual_hits:
        # De-dupe while preserving order: a dual phrase ("report + audit
        # report") textually contains an audit phrase ("audit report"), so both
        # sets usually fire together.
        merged = dual_hits + tuple(p for p in audit_hits if p not in dual_hits)
        return "audit", True, merged
    if audit_hits:
        return "audit", False, audit_hits
    if diminution_hits:
        return "diminution", False, diminution_hits
    return None, False, ()


class RuleEngine:
    def extract_record(
        self, document: DocumentModel, provider: dict[str, Any]
    ) -> ExtractedRecord:
        """Apply all configured rules in provider config to a DocumentModel.
        
        Runs extraction, normalizes results, applies conditional overrides,
        and runs cross-field validation to build the ExtractedRecord.
        """
        fields: dict[FieldKey, FieldExtraction] = {}
        field_rules = provider.get("field_rules", {})
        suppress_fallback_fields = {
            FieldKey(field)
            for field in provider.get("suppress_fallback_fields", [])
            if field in {key.value for key in FieldKey}
        }
        
        use_current_date = provider.get("use_current_date_for_inspection_date", False)
        force_postcode = provider.get("force_postcode_for_inspection_address", False)
        
        for field_key in FIELD_ORDER:
            key_str = field_key.value
            rule_cfg = field_rules.get(key_str)
            allow_fallback = field_key not in suppress_fallback_fields
            if provider.get("engineer_report") and field_key == FieldKey.INSPECTION_ADDRESS:
                allow_fallback = False
            
            # Default empty extraction
            ext = FieldExtraction(value="", raw_value="")
            
            if rule_cfg:
                ext = self.extract_field(document, field_key, rule_cfg)
                if rule_cfg.get("kind") == "manual":
                    allow_fallback = False

            if not ext.value and allow_fallback:
                fallback = self._fallback_field(document, field_key)
                if fallback.value:
                    fallback_norm = fallback.value
                    if field_key == FieldKey.VRM:
                        fallback_norm = normalize_vrm(fallback_norm)
                    elif field_key == FieldKey.MILEAGE:
                        fallback_norm = normalize_mileage(fallback_norm)
                    elif field_key in {FieldKey.INCIDENT_DATE, FieldKey.INSTRUCTION_DATE, FieldKey.INSPECTION_DATE}:
                        fallback_norm = normalize_date(fallback_norm)
                    elif field_key == FieldKey.VAT_STATUS:
                        fallback_norm = normalize_vat_status(fallback_norm)
                    elif field_key == FieldKey.MILEAGE_UNIT:
                        fallback_norm = normalize_mileage_unit(fallback_norm)
                    elif field_key == FieldKey.INSPECTION_ADDRESS:
                        fallback_norm = normalize_address(fallback_norm, force_postcode=force_postcode)
                    elif field_key == FieldKey.CLAIMANT_NAME:
                        fallback_norm = self._clean_claimant_name(fallback_norm)
                    elif field_key == FieldKey.CLAIMANT_TELEPHONE:
                        fallback_norm = normalize_telephone(fallback_norm)
                    elif field_key == FieldKey.CLAIMANT_EMAIL:
                        fallback_norm = normalize_email(fallback_norm)
                    if not fallback_norm.strip():
                        fallback_norm = ""

                    if fallback_norm and not self._is_suspicious_value(
                        field_key,
                        fallback_norm,
                        document,
                        fallback.source_span,
                    ):
                        ext = fallback
            
            # Normalise the value
            norm_val = ext.value
            if field_key == FieldKey.VRM:
                norm_val = normalize_vrm(norm_val)
            elif field_key == FieldKey.VIN:
                # A labelled placeholder cell ("-" — the Tractable empty-cell
                # convention) normalizes to EMPTY: a VIN the document does not
                # carry is absent, not a value (collisionspike TKT-147). The
                # fallback normalization sites above/below deliberately carry NO
                # VIN branch — _fallback_field returns empty for VIN by design
                # (no document-wide sniff), so this is the only site the field
                # can reach with a value.
                norm_val = normalize_vin(norm_val)
            elif field_key == FieldKey.MILEAGE:
                norm_val = normalize_mileage(norm_val)
            elif field_key in {FieldKey.INCIDENT_DATE, FieldKey.INSTRUCTION_DATE, FieldKey.INSPECTION_DATE}:
                norm_val = normalize_date(norm_val)
            elif field_key == FieldKey.VAT_STATUS:
                norm_val = normalize_vat_status(norm_val)
            elif field_key == FieldKey.MILEAGE_UNIT:
                norm_val = normalize_mileage_unit(norm_val)
            elif field_key == FieldKey.INSPECTION_ADDRESS:
                # An image-based / desktop-assessment statement (with no real
                # physical address) is not junk narrative: emit the canonical
                # IMAGE_BASED_ASSESSMENT value instead of letting it be blanked.
                if self._is_image_based_inspection(ext.raw_value or ext.value):
                    norm_val = self._canonical_image_based_address(force_postcode=force_postcode)
                else:
                    norm_val = normalize_address(norm_val, force_postcode=force_postcode)
            elif field_key == FieldKey.CLAIMANT_NAME:
                norm_val = self._clean_claimant_name(norm_val)
            elif field_key == FieldKey.CLAIMANT_TELEPHONE:
                norm_val = normalize_telephone(norm_val)
            elif field_key == FieldKey.CLAIMANT_EMAIL:
                norm_val = normalize_email(norm_val)

            if not norm_val.strip():
                ext = replace(ext, value="", raw_value=ext.raw_value)
                norm_val = ""

            if self._is_suspicious_value(field_key, norm_val, document, ext.source_span):
                fallback = (
                    self._fallback_field(document, field_key)
                    if allow_fallback
                    else FieldExtraction(value="", rule_id=f"fallback_{field_key.value}", confidence=0.0)
                )
                fallback_norm = fallback.value
                if field_key == FieldKey.VRM:
                    fallback_norm = normalize_vrm(fallback_norm)
                elif field_key == FieldKey.MILEAGE:
                    fallback_norm = normalize_mileage(fallback_norm)
                elif field_key in {FieldKey.INCIDENT_DATE, FieldKey.INSTRUCTION_DATE, FieldKey.INSPECTION_DATE}:
                    fallback_norm = normalize_date(fallback_norm)
                elif field_key == FieldKey.VAT_STATUS:
                    fallback_norm = normalize_vat_status(fallback_norm)
                elif field_key == FieldKey.MILEAGE_UNIT:
                    fallback_norm = normalize_mileage_unit(fallback_norm)
                elif field_key == FieldKey.INSPECTION_ADDRESS:
                    fallback_norm = normalize_address(fallback_norm, force_postcode=force_postcode)
                elif field_key == FieldKey.CLAIMANT_NAME:
                    fallback_norm = self._clean_claimant_name(fallback_norm)
                if not fallback_norm.strip():
                    fallback_norm = ""
                if fallback_norm and not self._is_suspicious_value(
                    field_key,
                    fallback_norm,
                    document,
                    fallback.source_span,
                ):
                    ext = fallback
                    norm_val = fallback_norm
                elif field_key in {
                    FieldKey.VRM,
                    FieldKey.VEHICLE_MODEL,
                    FieldKey.CLAIMANT_NAME,
                    FieldKey.REFERENCE,
                    FieldKey.INCIDENT_DATE,
                    FieldKey.INSTRUCTION_DATE,
                    FieldKey.INSPECTION_DATE,
                    FieldKey.INSPECTION_ADDRESS,
                }:
                    ext = replace(ext, value="", raw_value=ext.raw_value)
                    norm_val = ""
            
            # Apply conditional/fallback rules
            if field_key == FieldKey.WORK_PROVIDER and not norm_val:
                # An ``engineer_report: true`` layout (CNX/EVA -- an engineering
                # FIRM's report, not an instructing work provider) must NEVER
                # supply the work provider: on an audit case the attached
                # third-party report would otherwise leak its layout name (e.g.
                # "EVA (Engineers)") as the case's work provider (collisionspike
                # TKT-051). Left empty, the caller's UNKNOWN/blank path applies
                # and the real provider comes from the instruction document /
                # sender identity instead.
                # A layout may also DECLARE it carries no work provider
                # (suppress_default_work_provider, e.g. the CDQ claimant
                # questionnaire, collisionspike TKT-022) — the field stays
                # empty for the intake sender-context to fill, instead of the
                # template's name masquerading as a work provider.
                if not provider.get("engineer_report") and not provider.get("suppress_default_work_provider"):
                    norm_val = provider.get("work_provider", "").strip() or provider.get("name", "").strip()
            
            if field_key == FieldKey.INSPECTION_DATE and use_current_date:
                norm_val = datetime.now().strftime("%d/%m/%Y")
            
            # Update the extraction object with the normalized value
            ext_normalized = FieldExtraction(
                value=norm_val,
                raw_value=ext.raw_value,
                rule_id=ext.rule_id,
                confidence=ext.confidence,
                source_span=ext.source_span,
                issues=ext.issues
            )
            fields[field_key] = ext_normalized
            
        # Compile plain text fields for validation
        fields_str_map = {k: v.value for k, v in fields.items()}
        validation_issues = validate_fields(fields_str_map)
        
        # Attach issues to specific fields or to the record
        record_issues = []
        for issue in validation_issues:
            if issue.field and issue.field in fields:
                f_ext = fields[issue.field]
                fields[issue.field] = FieldExtraction(
                    value=f_ext.value,
                    raw_value=f_ext.raw_value,
                    rule_id=f_ext.rule_id,
                    confidence=f_ext.confidence,
                    source_span=f_ext.source_span,
                    issues=f_ext.issues + (issue,)
                )
            else:
                record_issues.append(issue)
                
        provider_match = ProviderMatch(
            provider_id=provider.get("id"),
            provider_name=provider.get("name", "Unknown"),
            confidence=1.0,
            matched_terms=(),
            missing_terms=(),
            rejected_terms=()
        )
        
        case_type, case_type_dual, case_type_signals = detect_case_type_signals(
            document.plain_text
        )

        return ExtractedRecord(
            provider=provider_match,
            fields=fields,
            issues=tuple(record_issues),
            is_audit=case_type == "audit",
            audit_signals=case_type_signals,
            case_type=case_type,
            case_type_dual=case_type_dual,
        )

    def extract_field(
        self, document: DocumentModel, field_key: FieldKey, rule_config: dict[str, Any]
    ) -> FieldExtraction:
        """Apply a single rule config to a DocumentModel."""
        rule_id = rule_config.get("id", "default")
        kind = rule_config.get("kind", "label_same_line")
        
        # Aggregate all lines across pages into a flat list for line-based operations
        flat_lines: list[DocumentLine] = []
        for page in document.pages:
            flat_lines.extend(page.lines)
        raw_lines = self._raw_lines(document, flat_lines)

        try:
            if kind == "label_same_line":
                return self._extract_label_same_line(flat_lines, rule_config, rule_id)
            elif kind == "label_next_line":
                return self._extract_label_next_line(flat_lines, rule_config, rule_id)
            elif kind == "label_same_or_next_line":
                return self._extract_label_same_or_next_line(flat_lines, rule_config, rule_id)
            elif kind == "two_label_join":
                return self._extract_two_label_join(flat_lines, rule_config, rule_id)
            elif kind == "between_labels":
                return self._extract_between_labels(flat_lines, document.plain_text, rule_config, rule_id)
            elif kind == "fixed_line":
                return self._extract_fixed_line(flat_lines, raw_lines, rule_config, rule_id)
            elif kind == "fixed_line_label":
                return self._extract_fixed_line_label(flat_lines, rule_config, rule_id)
            elif kind == "line_offset":
                return self._extract_line_offset(flat_lines, rule_config, rule_id)
            elif kind == "regex":
                return self._extract_regex(document.plain_text, rule_config, rule_id)
            elif kind == "presence":
                return self._extract_presence(document.plain_text, rule_config, rule_id)
            elif kind == "manual":
                return self._extract_manual(rule_config, rule_id)
            elif kind == "email_date":
                return self._extract_email_date(flat_lines, rule_config, rule_id)
            elif kind == "acsp_claim_form":
                return self._extract_acsp_claim_form(document, field_key, rule_id)
            elif kind == "cdq_claim_form":
                return self._extract_cdq_claim_form(document, field_key, rule_id)
            elif kind == "none":
                # Explicit no-op: the layout declares this field absent.
                return FieldExtraction(value="", rule_id=rule_id, confidence=0.0)
            else:
                return FieldExtraction(
                    value="",
                    issues=(ExtractionIssue(
                        field=field_key,
                        severity="error",
                        code="invalid_rule_kind",
                        message=f"Unknown rule kind: {kind}",
                    ),),
                )
        except Exception as exc:
            return FieldExtraction(
                value="",
                issues=(ExtractionIssue(
                    field=field_key,
                    severity="error",
                    code="extraction_failure",
                    message=f"Rule extraction crashed: {exc}",
                ),),
            )

    def _extract_label_same_line(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        labels = cfg.get("labels", [])
        for label in labels:
            res = fuzzy_find_label(lines, label)
            if res:
                idx, line, conf = res
                line_txt = line.text
                
                # Check for standard delimiters first on the line to see if we can cleanly split it.
                # E.g., "Vehcle Reglstratlon: AA11BBB" -> split by ":"
                split_success = False
                for sep in (":", "|"):
                    if sep in line_txt:
                        parts = line_txt.split(sep, 1)
                        left_part = parts[0].strip()
                        # If the left part fuzzy matches our label, the right part is the value!
                        # Compare using difflib
                        ratio = difflib.SequenceMatcher(None, label.lower().strip(), left_part.lower().strip()).ratio()
                        if ratio >= 0.7:
                            val = clean_val(parts[1])
                            return FieldExtraction(
                                value=val,
                                raw_value=val,
                                rule_id=rule_id,
                                confidence=max(conf, ratio),
                                source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                            )
                dash_match = re.search(r"\s[-–—]\s", line_txt)
                if dash_match:
                    left_part = line_txt[:dash_match.start()].strip()
                    ratio = difflib.SequenceMatcher(None, label.lower().strip(), left_part.lower().strip()).ratio()
                    if ratio >= 0.7:
                        val = clean_val(line_txt[dash_match.end():])
                        return FieldExtraction(
                            value=val,
                            raw_value=val,
                            rule_id=rule_id,
                            confidence=max(conf, ratio),
                            source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                        )
                
                # If no split worked, try exact substring match
                lbl_idx = line_txt.lower().find(label.lower())
                if lbl_idx >= 0:
                    val = clean_val(line_txt[lbl_idx + len(label):])
                else:
                    # Let's find the best matching substring using SequenceMatcher get_matching_blocks
                    s = difflib.SequenceMatcher(None, label.lower(), line_txt.lower())
                    matching_blocks = s.get_matching_blocks()
                    if matching_blocks:
                        # Find the end of the last matched block to slice after it
                        last_block = max(matching_blocks, key=lambda b: b.b)
                        end_idx = last_block.b + last_block.size
                        val = clean_val(line_txt[end_idx:])
                    else:
                        val = clean_val(line_txt)
                
                if val:
                    return FieldExtraction(
                        value=val,
                        raw_value=val,
                        rule_id=rule_id,
                        confidence=conf,
                        source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                    )
        return FieldExtraction(value="", rule_id=rule_id)

    def _extract_label_next_line(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        labels = cfg.get("labels", [])
        for label in labels:
            res = fuzzy_find_label(lines, label)
            if res:
                idx, line, conf = res
                # Find the next non-empty line
                for next_line in lines[idx + 1:]:
                    val = clean_val(next_line.text)
                    if val and not self._is_label_only_value(val):
                        return FieldExtraction(
                            value=val,
                            raw_value=val,
                            rule_id=rule_id,
                            confidence=conf,
                            source_span=SourceSpan(page_index=next_line.page_index, line_index=next_line.line_index, bbox=next_line.bbox),
                        )
        return FieldExtraction(value="", rule_id=rule_id)

    def _extract_label_same_or_next_line(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        same_line = self._extract_label_same_line(lines, cfg, rule_id)
        # Composite labels such as ``Our Insured: Name:`` can leave the trailing
        # label word "Name" as the apparent same-line value. That is still a label,
        # so continue to the next line instead of blanking it later as suspicious.
        if same_line.value and not self._is_label_only_value(same_line.value):
            return same_line
        return self._extract_label_next_line(lines, cfg, rule_id)

    # Bare placeholder tokens a labelled table cell prints instead of a value
    # (the Tractable Vehicle Information rows use a lone "-" — collisionspike
    # TKT-147). A two_label_join part carrying only a placeholder is ABSENT, so
    # it can never pollute the joined value ("- Touran").
    _JOIN_PART_PLACEHOLDERS = frozenset({"-", "–", "—"})

    def _extract_two_label_join(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        """Join the values of TWO separately-labelled fields into one value.

        Collisionspike TKT-147: the Tractable damage-capture PDF labels the
        vehicle make ("Producer") and model ("Model") as two SEPARATE
        label/value pairs, and its two-column layout interleaves Repair Summary
        rows between them in the extracted line stream — a single-label capture
        sees only one half, and a between_labels capture reads the interleaved
        junk. Each part is captured independently with the existing
        label_same_or_next_line machinery (``first_labels`` / ``second_labels``
        are each an ordered list of alternate labels), a part whose value is a
        bare placeholder dash reads as absent, and the non-empty parts are
        joined with ``separator`` (default single space):
        "Producer"→"Volkswagen" + "Model"→"Touran" ⇒ "Volkswagen Touran".
        One absent part degrades to the other alone; both absent ⇒ a clean
        empty miss. Confidence is the MINIMUM of the joined parts' confidences
        (conservative); the source span is the first joined part's.
        """
        separator = str(cfg.get("separator", " "))
        parts: list[str] = []
        confidences: list[float] = []
        span: SourceSpan | None = None
        for labels_key in ("first_labels", "second_labels"):
            labels = cfg.get(labels_key, [])
            if not labels:
                continue
            part = self._extract_label_same_or_next_line(
                lines, {"labels": labels}, rule_id
            )
            value = part.value.strip()
            if value in self._JOIN_PART_PLACEHOLDERS:
                value = ""
            if not value:
                continue
            parts.append(value)
            confidences.append(part.confidence if part.confidence is not None else 0.0)
            if span is None:
                span = part.source_span
        val = clean_val(separator.join(parts))
        if not val:
            return FieldExtraction(value="", rule_id=rule_id)
        return FieldExtraction(
            value=val,
            raw_value=val,
            rule_id=rule_id,
            confidence=min(confidences) if confidences else 0.0,
            source_span=span,
        )

    def _extract_between_labels(self, lines: list[DocumentLine], plain_text: str, cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        label_pairs: list[tuple[str, str]] = []
        for pair in cfg.get("label_pairs", []):
            if isinstance(pair, dict):
                start = str(pair.get("start_label", "")).strip()
                end = str(pair.get("end_label", "")).strip()
                if start and end:
                    label_pairs.append((start, end))

        start_label = cfg.get("start_label", "")
        end_label = cfg.get("end_label", "")
        if start_label and end_label:
            label_pairs.append((str(start_label).strip(), str(end_label).strip()))

        if not label_pairs:
            return FieldExtraction(value="", rule_id=rule_id)

        for start, end in label_pairs:
            ext = self._extract_between_label_pair(lines, plain_text, start, end, rule_id)
            if ext.value:
                return ext
        return FieldExtraction(value="", rule_id=rule_id)

    def _extract_between_label_pair(
        self,
        lines: list[DocumentLine],
        plain_text: str,
        start_label: str,
        end_label: str,
        rule_id: str,
    ) -> FieldExtraction:
        # Regex search first
        pattern = re.compile(rf"(?is){re.escape(start_label)}\s*:?\s*(.*?)\s*(?={re.escape(end_label)})")
        match = pattern.search(plain_text)
        if match:
            val = clean_val(match.group(1))
            if val:
                return FieldExtraction(value=val, raw_value=val, rule_id=rule_id, confidence=1.0)

        # Iterate lines fallback — require the end label; otherwise the next
        # label pair (or caller) can try. Without this, a missing end marker
        # would capture through EOF (e.g. AX PDFs without a "Pre Existing" row).
        capture = False
        collected = []
        source_span = None
        end_found = False
        for line in lines:
            line_txt = line.text
            lower = line_txt.lower().strip()
            if not capture:
                if lower.startswith(start_label.lower()):
                    capture = True
                    remainder = clean_val(re.sub(rf"(?i)^{re.escape(start_label)}\s*:?", "", line_txt))
                    if remainder:
                        collected.append(remainder)
                    source_span = SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox)
            else:
                if lower.startswith(end_label.lower()):
                    end_found = True
                    break
                collected.append(clean_val(line_txt))

        if not capture or not end_found:
            return FieldExtraction(value="", rule_id=rule_id)

        val = clean_val("\n".join(c for c in collected if c))
        return FieldExtraction(
            value=val,
            raw_value=val,
            rule_id=rule_id,
            confidence=1.0 if val else 0.0,
            source_span=source_span,
        )

    def _extract_fixed_line(self, lines: list[DocumentLine], raw_lines: list[str], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        start = cfg.get("line_start")
        end = cfg.get("line_end")
        if start and end:
            first = max(int(start), 1)
            last = max(int(end), first)
            source = raw_lines if raw_lines else [line.text for line in lines]
            selected = [clean_val(line) for line in source[first - 1:last] if clean_val(line)]
            val = clean_val("\n".join(selected))
            span_line = lines[min(first - 1, len(lines) - 1)] if lines else None
            return FieldExtraction(
                value=val,
                raw_value=val,
                rule_id=rule_id,
                confidence=1.0 if val else 0.0,
                source_span=SourceSpan(page_index=span_line.page_index, line_index=span_line.line_index, bbox=span_line.bbox) if span_line else None,
            )

        line_no = cfg.get("line_number")
        if not line_no or line_no <= 0 or line_no > len(lines):
            return FieldExtraction(value="", rule_id=rule_id)

        line = lines[line_no - 1]
        val = clean_val(line.text)
        return FieldExtraction(
            value=val,
            raw_value=val,
            rule_id=rule_id,
            confidence=1.0,
            source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
        )

    def _extract_fixed_line_label(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        line_no = cfg.get("line_number")
        labels = cfg.get("labels", [])
        if not line_no or line_no <= 0 or line_no > len(lines) or not labels:
            return FieldExtraction(value="", rule_id=rule_id)

        line = lines[line_no - 1]
        line_txt = line.text
        for label in labels:
            idx = line_txt.lower().find(label.lower())
            if idx >= 0:
                after = clean_val(line_txt[idx + len(label):])
                return FieldExtraction(
                    value=after,
                    raw_value=after,
                    rule_id=rule_id,
                    confidence=1.0,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        return FieldExtraction(value="", rule_id=rule_id)

    def _extract_line_offset(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        labels = cfg.get("labels", [])
        offset = cfg.get("offset", 0)

        for label in labels:
            res = fuzzy_find_label(lines, label)
            if res:
                anchor_idx, anchor_line, conf = res
                if offset == 0:
                    val = clean_val(anchor_line.text)
                    return FieldExtraction(
                        value=val,
                        raw_value=val,
                        rule_id=rule_id,
                        confidence=conf,
                        source_span=SourceSpan(page_index=anchor_line.page_index, line_index=anchor_line.line_index, bbox=anchor_line.bbox),
                    )

                step = 1 if offset > 0 else -1
                steps_remaining = abs(offset)
                i = anchor_idx + step
                last_seen = anchor_idx

                while 0 <= i < len(lines) and steps_remaining > 0:
                    if clean_val(lines[i].text):
                        last_seen = i
                        steps_remaining -= 1
                        if steps_remaining == 0:
                            break
                    i += step
                
                target_line = lines[last_seen]
                val = clean_val(target_line.text)
                return FieldExtraction(
                    value=val,
                    raw_value=val,
                    rule_id=rule_id,
                    confidence=conf,
                    source_span=SourceSpan(page_index=target_line.page_index, line_index=target_line.line_index, bbox=target_line.bbox),
                )
        return FieldExtraction(value="", rule_id=rule_id)

    def _extract_regex(self, plain_text: str, cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        pattern_str = cfg.get("pattern", "")
        if not pattern_str:
            return FieldExtraction(value="", rule_id=rule_id)

        try:
            pattern = re.compile(pattern_str, re.IGNORECASE | re.MULTILINE)
        except re.error as err:
            raise ValueError(f"Invalid regex pattern '{pattern_str}': {err}")

        match = pattern.search(plain_text)
        if match:
            # If there are groups, take the first populated one; else take the whole match.
            # This allows regex rules to express ordered fallbacks with alternation.
            val = clean_val(next((group for group in match.groups() if group), match.group(0)) if match.groups() else match.group(0))
            return FieldExtraction(value=val, raw_value=val, rule_id=rule_id, confidence=1.0)
        return FieldExtraction(value="", rule_id=rule_id)

    def _extract_presence(self, plain_text: str, cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        tokens = cfg.get("tokens", [])
        value_if_present = cfg.get("value", "Yes")
        value_if_absent = cfg.get("absent_value", "")
        
        if not tokens:
            return FieldExtraction(value="", rule_id=rule_id)

        haystack = plain_text.lower()
        for token in tokens:
            needle = token.lower().strip()
            if needle and needle in haystack:
                return FieldExtraction(value=value_if_present, raw_value=value_if_present, rule_id=rule_id, confidence=1.0)
        
        return FieldExtraction(value=value_if_absent, raw_value=value_if_absent, rule_id=rule_id, confidence=1.0)

    def _extract_manual(self, cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        val = cfg.get("value", "").strip()
        if val.lower() == "{today}":
            val = datetime.now().strftime("%d/%m/%Y")
        return FieldExtraction(value=val, raw_value=val, rule_id=rule_id, confidence=1.0)

    def _extract_acsp_claim_form(self, document: DocumentModel, field_key: FieldKey, rule_id: str) -> FieldExtraction:
        lines = [line for page in document.pages for line in page.lines]
        text = document.plain_text

        if field_key == FieldKey.WORK_PROVIDER:
            return FieldExtraction(value="ACSP", raw_value="ACSP", rule_id=rule_id, confidence=1.0)
        if field_key == FieldKey.VRM:
            return self._acsp_vehicle_value(lines, "reg no", rule_id, value_pattern=VRM_RE)
        if field_key == FieldKey.VEHICLE_MODEL:
            return self._acsp_vehicle_value(lines, "make & model", rule_id)
        if field_key == FieldKey.CLAIMANT_NAME:
            claimant = self._acsp_claimant(lines)
            return FieldExtraction(value=claimant, raw_value=claimant, rule_id=rule_id, confidence=0.9 if claimant else 0.0)
        if field_key == FieldKey.INSPECTION_ADDRESS:
            address = self._acsp_claimant_address(lines)
            return FieldExtraction(value=address, raw_value=address, rule_id=rule_id, confidence=0.85 if address else 0.0)
        if field_key == FieldKey.REFERENCE:
            match = re.search(r"(?im)^\s*Claim Ref:\s*(.+?)\s*$", text)
            value = clean_val(match.group(1)) if match else ""
            if self._acsp_line_starts_field(value):
                value = ""
            return FieldExtraction(value=value, raw_value=value, rule_id=rule_id, confidence=0.75 if value else 0.0)
        if field_key == FieldKey.INCIDENT_DATE:
            match = re.search(r"(?im)^\s*Accident Date:\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})", text)
            value = clean_val(match.group(1)) if match else ""
            return FieldExtraction(value=value, raw_value=value, rule_id=rule_id, confidence=0.95 if value else 0.0)
        if field_key == FieldKey.ACCIDENT_CIRCUMSTANCES:
            value = self._acsp_accident_circumstances(lines)
            return FieldExtraction(value=value, raw_value=value, rule_id=rule_id, confidence=0.85 if value else 0.0)

        return FieldExtraction(value="", rule_id=rule_id, confidence=0.0)

    # --- CDQ: claimant/defendant questionnaire claim form (collisionspike TKT-022)
    # A textbox-drawn solicitor/CMC claim-intake questionnaire with DEFENDANT and
    # CLAIMANT sections carrying the SAME labels ("Name", "Vehicle Registration",
    # "Vehicle make/model", "Email", ...). The generic label fallbacks read the
    # first (defendant) occurrence — the live Cheema failure: defendant colour
    # fragment as the vehicle model, a questionnaire prompt as the claimant name,
    # a "-" value prefix leaking into the email. Every value here is read from
    # the CLAIMANT section only, with the questionnaire's leading-dash value
    # convention stripped. The layout names NO work provider (see
    # suppress_default_work_provider in providers.json).

    _CDQ_SECTION_STOPS = (
        "accident details",
        "defendant",
        "further accident details",
        "police details",
        "ambulance details",
        "heads of loss",
        "vehicle damage",
        "injury and medical details",
    )

    def _extract_cdq_claim_form(self, document: DocumentModel, field_key: FieldKey, rule_id: str) -> FieldExtraction:
        lines = [line for page in document.pages for line in page.lines]

        def _found(value: str, confidence: float = 0.9) -> FieldExtraction:
            return FieldExtraction(
                value=value, raw_value=value, rule_id=rule_id,
                confidence=confidence if value else 0.0,
            )

        if field_key == FieldKey.VRM:
            value = self._cdq_claimant_value(lines, ("vehicle registration",))
            match = VRM_RE.search(value) if value else None
            return _found(clean_val(match.group(1)) if match else "", 0.92)
        if field_key == FieldKey.VEHICLE_MODEL:
            return _found(self._cdq_claimant_value(lines, ("vehicle make/model",)))
        if field_key == FieldKey.CLAIMANT_NAME:
            return _found(self._cdq_claimant_value(lines, ("name",)))
        if field_key == FieldKey.CLAIMANT_TELEPHONE:
            return _found(self._cdq_claimant_value(lines, ("telephone number", "telephone")))
        if field_key == FieldKey.CLAIMANT_EMAIL:
            return _found(self._cdq_claimant_value(lines, ("email",)))
        if field_key == FieldKey.INSPECTION_ADDRESS:
            street = self._cdq_claimant_value(lines, ("address",))
            postcode = self._cdq_claimant_value(lines, ("post code", "postcode"))
            value = clean_val("\n".join(p for p in (street, postcode) if p))
            return _found(value, 0.85)
        if field_key == FieldKey.INCIDENT_DATE:
            return _found(self._cdq_accident_details_value(lines, "date"), 0.92)
        if field_key == FieldKey.ACCIDENT_CIRCUMSTANCES:
            return _found(self._cdq_accident_circumstances(lines), 0.85)

        return FieldExtraction(value="", rule_id=rule_id, confidence=0.0)

    def _cdq_section_bounds(self, lines: list[DocumentLine], section: str) -> tuple[int, int] | None:
        """(start, end) line indexes of a CDQ section body ("claimant", ...)."""
        start = next(
            (idx for idx, line in enumerate(lines) if self._normalized_label_text(line.text) == section),
            None,
        )
        if start is None:
            return None
        end = len(lines)
        for idx in range(start + 1, len(lines)):
            if self._normalized_label_text(lines[idx].text) in self._CDQ_SECTION_STOPS:
                end = idx
                break
        return start + 1, end

    @staticmethod
    def _cdq_clean_value(value: str) -> str:
        """Strip the questionnaire's value decorations: leading '-'/':' markers
        ("-SN67 USB", "-AJMAL.CHEEMA@YAHOO.COM") and dotted answer-leader runs
        (an ellipsis char is ALWAYS a leader; ASCII dots only in runs of 2+ so
        a genuine full stop survives)."""
        value = re.sub(r"…+|\.{2,}", " ", value)
        value = re.sub(r"^[\s:\-–—.…]+", "", value)
        return clean_val(value)

    def _cdq_claimant_value(self, lines: list[DocumentLine], labels: tuple[str, ...]) -> str:
        bounds = self._cdq_section_bounds(lines, "claimant")
        if bounds is None:
            return ""
        start, end = bounds
        for line in lines[start:end]:
            text = line.text.strip()
            lower = text.lower()
            if "?" in text:
                continue  # a questionnaire prompt, never a value line
            for label in labels:
                if lower.startswith(label):
                    value = self._cdq_clean_value(text[len(label):])
                    if value:
                        return value
        return ""

    def _cdq_accident_details_value(self, lines: list[DocumentLine], label: str) -> str:
        bounds = self._cdq_section_bounds(lines, "accident details")
        if bounds is None:
            return ""
        start, end = bounds
        for line in lines[start:min(end, start + 8)]:
            lower = line.text.strip().lower()
            if lower.startswith(label):
                value = self._cdq_clean_value(line.text.strip()[len(label):])
                if value:
                    return value
        return ""

    def _cdq_accident_circumstances(self, lines: list[DocumentLine]) -> str:
        """The narrative under the "Accident Circumstances" heading, bounded at
        the next questionnaire prompt (a "?" line) or section heading, with the
        dotted answer-leader runs stripped."""
        start = next(
            (idx for idx, line in enumerate(lines)
             if self._normalized_label_text(line.text) == "accident circumstances"),
            None,
        )
        if start is None:
            return ""
        collected: list[str] = []
        for line in lines[start + 1:start + 12]:
            text = line.text.strip()
            if "?" in text:
                break  # the next questionnaire prompt ends the narrative
            if self._normalized_label_text(text) in self._CDQ_SECTION_STOPS:
                break
            value = self._cdq_clean_value(text)
            if value:
                collected.append(value)
        joined = clean_val(" ".join(collected))
        # A leader run at the answer's tail can leave a lone orphaned dot.
        return re.sub(r"(?:\s+\.)+$", "", joined)

    def _acsp_vehicle_value(
        self,
        lines: list[DocumentLine],
        label: str,
        rule_id: str,
        value_pattern: re.Pattern[str] | None = None,
    ) -> FieldExtraction:
        start_idx = self._acsp_client_vehicle_start(lines)
        if start_idx is None:
            return FieldExtraction(value="", rule_id=rule_id, confidence=0.0)

        stop_re = re.compile(r"^\s*(?:Witness Details|Police Details|Accident Details|Third Party Details)\b", re.IGNORECASE)
        label_re = re.compile(rf"\b{re.escape(label)}\s*:\s*(.+)", re.IGNORECASE)
        for line in lines[start_idx:start_idx + 35]:
            if line.line_index != lines[start_idx].line_index and stop_re.search(line.text):
                break
            match = label_re.search(line.text)
            if not match:
                continue
            value = clean_val(match.group(1).split("|", 1)[0])
            if value_pattern:
                value_match = value_pattern.search(value)
                value = clean_val(value_match.group(1) if value_match else value)
            if label == "make & model":
                value = self._acsp_clean_vehicle_model(value)
            return FieldExtraction(
                value=value,
                raw_value=value,
                rule_id=rule_id,
                confidence=0.92,
                source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
            )
        return FieldExtraction(value="", rule_id=rule_id, confidence=0.0)

    def _acsp_client_vehicle_start(self, lines: list[DocumentLine]) -> int | None:
        for idx, line in enumerate(lines):
            normalized = self._normalized_label_text(line.text)
            if normalized == "vehicle details" or normalized.endswith(" vehicle details"):
                if "third party vehicle details" not in normalized:
                    return idx
        return None

    def _acsp_claimant(self, lines: list[DocumentLine]) -> str:
        owner = self._acsp_section_value(lines, "owner details", "name")
        driver = self._acsp_section_value(lines, "driver details", "name")
        value = driver if self._acsp_owner_is_placeholder(owner) and driver else owner or driver
        return self._acsp_clean_name(value)

    def _acsp_clean_vehicle_model(self, value: str) -> str:
        compact = self._normalized_label_text(value)
        if "toy" in compact and re.search(r"\bpr[il1s5]*s?\b", compact):
            return "Toyota Prius"
        return value

    def _acsp_clean_name(self, value: str) -> str:
        return re.sub(r"(?<=[a-z])C\b", "", value).strip()

    def _acsp_claimant_address(self, lines: list[DocumentLine]) -> str:
        owner = self._acsp_section_value(lines, "owner details", "name")
        driver = self._acsp_section_value(lines, "driver details", "name")
        owner_start = self._acsp_section_start(lines, "owner details")
        driver_start = self._acsp_section_start(lines, "driver details")
        owner_address = self._acsp_address_near_value(lines, owner) or (
            self._acsp_address_after(lines, owner_start) if owner_start is not None else ""
        )
        driver_address = self._acsp_address_near_value(lines, driver) or (
            self._acsp_address_after(lines, driver_start) if driver_start is not None else ""
        )
        return driver_address if self._acsp_owner_is_placeholder(owner) and driver_address else owner_address or driver_address

    def _acsp_address_near_value(self, lines: list[DocumentLine], anchor: str) -> str:
        if not anchor:
            return ""
        anchor_idx = next((idx for idx, line in enumerate(lines) if anchor.lower() in line.text.lower()), None)
        if anchor_idx is None:
            return ""
        return self._acsp_address_after(lines, anchor_idx, anchor)

    def _acsp_address_after(self, lines: list[DocumentLine], start_idx: int, anchor: str | None = None) -> str:
        for local_idx, line in enumerate(lines[start_idx:start_idx + 12], start=start_idx):
            search_text = line.text
            if local_idx == start_idx and anchor and anchor.lower() in search_text.lower():
                anchor_pos = search_text.lower().find(anchor.lower())
                search_text = search_text[anchor_pos + len(anchor):]
            match = re.search(r"(?:^|\|)\s*Address:\s*([^|\n]*)", search_text, re.IGNORECASE)
            if not match:
                continue
            same_line = clean_val(match.group(1))
            collected = [same_line] if same_line and not self._acsp_line_starts_field(same_line) else []
            for next_line in lines[local_idx + 1:local_idx + 6]:
                value = clean_val(next_line.text.split("|", 1)[0])
                if not value:
                    continue
                if self._acsp_line_starts_field(value):
                    break
                collected.append(value)
                if UK_POSTCODE_RE.search(value):
                    break
            return clean_val("\n".join(collected))
        return ""

    def _acsp_owner_is_placeholder(self, value: str) -> bool:
        normalized = self._normalized_label_text(value)
        return (
            not normalized
            or normalized == "same"
            or normalized.startswith("leased")
            or normalized in {"car hire specialists"}
        )

    def _acsp_section_value(self, lines: list[DocumentLine], section: str, label: str, multiline: bool = False) -> str:
        section_idx = self._acsp_section_start(lines, section)
        if section_idx is None:
            return ""
        next_section_idx = self._acsp_next_section_start(lines, section_idx)
        section_lines = lines[section_idx + 1:next_section_idx]

        label_patterns = [rf"(?:^|\|)\s*{re.escape(label)}\s*:\s*([^|\n]*)"]
        if self._normalized_label_text(section) == "driver details":
            label_patterns.insert(0, rf"\|\s*{re.escape(label)}\s*:\s*([^|\n]*)")

        for local_idx, line in enumerate(section_lines):
            match = next(
                (
                    candidate
                    for pattern in label_patterns
                    if (candidate := re.search(pattern, line.text, re.IGNORECASE))
                ),
                None,
            )
            if not match:
                continue
            value = clean_val(match.group(1))
            if multiline and (not value or self._is_label_only_value(value)):
                collected: list[str] = []
                for next_line in section_lines[local_idx + 1:local_idx + 5]:
                    next_value = clean_val(next_line.text.split("|", 1)[0])
                    if not next_value:
                        continue
                    if self._acsp_line_starts_field(next_value):
                        break
                    collected.append(next_value)
                    if UK_POSTCODE_RE.search(next_value):
                        break
                value = clean_val("\n".join(collected))
            if value and not self._is_label_only_value(value):
                return value
        return ""

    def _acsp_section_start(self, lines: list[DocumentLine], section: str) -> int | None:
        target = self._normalized_label_text(section)
        for idx, line in enumerate(lines):
            normalized = self._normalized_label_text(line.text)
            if target in normalized:
                return idx
        return None

    def _acsp_next_section_start(self, lines: list[DocumentLine], section_idx: int) -> int:
        section_re = re.compile(
            r"\b(?:driver details|vehicle details|witness details|third party details|third party vehicle details|police details|accident details|injuries|previous accidents|details of claim|declaration)\b",
            re.IGNORECASE,
        )
        for idx in range(section_idx + 1, len(lines)):
            if section_re.search(lines[idx].text):
                return idx
        return len(lines)

    def _acsp_line_starts_field(self, value: str) -> bool:
        return bool(
            re.match(
                r"^(?:name|address|tel|d\.?o\.?b|dob|male/female|occupation|national|n\.?i\.?|number of passengers|email add|taxi|taxi company|licensed council|reg no|make & model)\b",
                value,
                re.IGNORECASE,
            )
        )

    def _acsp_accident_circumstances(self, lines: list[DocumentLine]) -> str:
        text = "\n".join(line.text for line in lines)
        matches = re.findall(r"(?is)\bAccident Circumstances\s*:?\s*(.+?)(?=Was Client wearing a seatbelt)", text)
        candidates: list[str] = []
        for match in matches:
            parts = []
            for raw_line in match.splitlines():
                value = clean_val(raw_line)
                if value and not self._acsp_skip_circumstance_line(value):
                    parts.append(value)
            value = clean_val(" ".join(parts))
            if value and len(value) > 10:
                candidates.append(value)
        if candidates:
            return min(candidates, key=len)

        start_idx = next((idx for idx, line in enumerate(lines) if "accident circumstances" in line.text.lower()), None)
        if start_idx is None:
            return ""

        collected: list[str] = []
        same_line = re.sub(r"(?i)^.*?accident circumstances\s*:?", "", lines[start_idx].text).strip()
        if same_line and not self._acsp_skip_circumstance_line(same_line):
            collected.append(same_line)

        for line in lines[start_idx + 1:]:
            value = clean_val(line.text)
            if not value:
                continue
            lower = value.lower()
            if "was client wearing a seatbelt" in lower:
                break
            if self._acsp_skip_circumstance_line(value):
                continue
            collected.append(value)

        return clean_val(" ".join(collected))

    def _acsp_skip_circumstance_line(self, value: str) -> bool:
        normalized = self._normalized_label_text(value)
        if not normalized:
            return True
        if normalized in {
            "private confidential",
            "vehicle details",
            "witness details",
            "police details",
            "weather conditions",
            "road conditions",
        }:
            return True
        return bool(
            re.match(
                r"^(?:reg no|make & model|insurance company|type of cover|policy no|name|address|tel|email|did police attend|ref no|officer name|police station|weather conditions|road conditions)\b",
                value,
                re.IGNORECASE,
            )
        )

    def _extract_email_date(self, lines: list[DocumentLine], cfg: dict[str, Any], rule_id: str) -> FieldExtraction:
        labels = cfg.get("labels", [])
        date_re = re.compile(r"\b(\d{4}-\d{1,2}-\d{1,2})\b")

        for label in labels:
            res = fuzzy_find_label(lines, label)
            if res:
                idx, line, conf = res
                line_txt = line.text
                lbl_idx = line_txt.lower().find(label.lower())
                if lbl_idx >= 0:
                    tail = line_txt[lbl_idx + len(label):]
                else:
                    tail = line_txt
                
                match = date_re.search(tail)
                if match:
                    iso = match.group(1)
                    try:
                        dt = datetime.strptime(iso, "%Y-%m-%d")
                        val = dt.strftime("%d/%m/%Y")
                        return FieldExtraction(
                            value=val,
                            raw_value=val,
                            rule_id=rule_id,
                            confidence=conf,
                            source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                        )
                    except ValueError:
                        continue
        return FieldExtraction(value="", rule_id=rule_id)

    def _raw_lines(self, document: DocumentModel, lines: list[DocumentLine]) -> list[str]:
        metadata_lines = document.metadata.get("raw_lines") if isinstance(document.metadata, dict) else None
        if isinstance(metadata_lines, list) and all(isinstance(line, str) for line in metadata_lines):
            return metadata_lines
        if document.plain_text:
            return document.plain_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        return [line.text for line in lines]

    def _is_label_only_value(self, value: str) -> bool:
        cleaned = clean_val(value).lower().strip(" :")
        return cleaned in {
            "name",
            "model",
            "make/model",
            "make",
            "vehicle",
            "registration",
            "reg",
            "reference",
            "ref",
            "date",
            "client",
            "claimant",
            "our client",
            "our insured",
            "your ref",
            "our ref",
            "post code",
            "postcode",
            ":",
        }

    def _clean_claimant_name(self, value: str) -> str:
        cleaned = clean_val(value)
        cleaned = re.sub(r"\s*[-–]\s*[A-Z]{2}\d{2}\s?[A-Z]{3}\s*$", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*[-–]\s*[A-Z]{1,3}\d{1,3}\s?[A-Z]{3}\s*$", "", cleaned, flags=re.IGNORECASE)
        return clean_val(cleaned)

    _CLAIMANT_PLACEHOLDER_VALUES: frozenset[str] = frozenset(
        {
            "tbc",
            "tba",
            "none",
            "unknown",
            "not known",
            "not provided",
            "not available",
            "not applicable",
            "to be confirmed",
            "to be advised",
        }
    )

    def _is_claimant_placeholder(self, value: str) -> bool:
        """Return true for explicit absence markers, never for a claimant name.

        Keep this field-specific: accepting a single surname behind an explicit
        claimant label is intentional, while values such as ``TBC`` and ``N/A``
        state that the source does not yet carry a defensible name.
        """
        cleaned = clean_val(value).casefold().strip()
        if not cleaned or cleaned in {"-", "–", "—"}:
            return True
        if re.fullmatch(r"n\s*[./\\-]\s*a\.?", cleaned):
            return True
        normalized = re.sub(r"\s+", " ", cleaned).strip(" .,:;|-–—")
        return normalized in self._CLAIMANT_PLACEHOLDER_VALUES

    def _is_suspicious_value(
        self,
        field_key: FieldKey,
        value: str,
        document: DocumentModel,
        source_span: SourceSpan | None = None,
    ) -> bool:
        cleaned = clean_val(value)
        lower = cleaned.lower()
        if field_key not in {FieldKey.ACCIDENT_CIRCUMSTANCES, FieldKey.INSPECTION_ADDRESS}:
            salutations = {
                "yours faithfully",
                "yours sincerely",
                "dear sirs",
                "dear sir",
                "dear mr",
                "dear ms",
                "dear miss",
                "dear mrs",
                "solicitors limited",
                "baker & coleman",
            }
            if any(s in lower for s in salutations):
                return True
        if field_key in {FieldKey.INCIDENT_DATE, FieldKey.INSTRUCTION_DATE, FieldKey.INSPECTION_DATE}:
            return bool(cleaned) and not re.fullmatch(r"\d{2}/\d{2}/\d{4}", cleaned)
        if field_key == FieldKey.CLAIMANT_NAME:
            if self._source_is_in_email_signature(document, source_span):
                return True
            if self._is_claimant_placeholder(cleaned):
                return True
            if len(cleaned) > 40:
                return True
            if any(w in f" {lower} " for w in (" was ", " has ", " had ", " been ", " when ", " hit ", " that ", " this ", " inspect ", " report ", " parked ", " vehicle ", " accident ", " witness ", " seen ", " collision ")):
                return True
            return (
                self._is_label_only_value(cleaned)
                or bool(re.fullmatch(r"[A-Z]{1,3}\d{1,3}\s?[A-Z]{3}", cleaned, re.IGNORECASE))
                or any(
                    phrase in lower
                    for phrase in ("accident:", "client:", "stationary at", "proceedings ", "defendant", "claimant was")
                )
            )
        if field_key == FieldKey.VEHICLE_MODEL:
            if len(cleaned) > 40:
                if any(w in lower for w in ("grateful", "arrange", "inspect", "forward", "report", "locate", "address", "accident", "loss", "collision", "damage", "liability")):
                    return True
            vrm_match = self._fallback_vrm_from_labels([line for page in document.pages for line in page.lines])
            vrm = normalize_vrm(vrm_match.value) if vrm_match.value else ""
            return (
                self._is_label_only_value(cleaned)
                or cleaned in {",", ".", "-"}
                or len(cleaned) <= 1
                or (vrm and vrm in normalize_vrm(cleaned))
                or any(
                    phrase in lower
                    for phrase in (
                        "please",
                        "accident",
                        "claimant",
                        "defendant",
                        "currently located",
                        "vehicle is currently located",
                        "introducer",
                        " is called ",
                        "source:",
                        "provide a report",
                        "report detailing",
                        "costs of repair",
                        "cost of replacement",
                        "damage",
                        "liability",
                    )
                )
            )
        if field_key == FieldKey.VRM:
            compact = normalize_vrm(cleaned)
            if not compact:
                return False
            # Every real UK registration mark carries at least one digit (current /
            # prefix / suffix / dateless alike) — an all-alphabetic value is a word,
            # never a mark. Catches the live TKT-085 failure where the audit case
            # A.PCH26003 logged its registration as the month word "OCTOBER".
            if compact.isalpha():
                return True
            # TKT-100: a loose dateless shape whose alpha head is a common English
            # function word ("and 2" -> AND2) is running prose, not a plate.
            loose = re.fullmatch(r"([A-Z]{1,3})\d{1,4}", compact)
            if loose and loose.group(1) in _VRM_LOOSE_ALPHA_STOPWORDS:
                return True
            if len(compact) < 5 and not re.fullmatch(r"[A-Z]{1,3}\d{1,3}[A-Z]{1,3}", compact):
                return True
            postcode_context = re.search(rf"\b{re.escape(cleaned)}\s*\d[A-Z]{{2}}\b", document.plain_text, re.IGNORECASE)
            return bool(postcode_context)
        if field_key == FieldKey.REFERENCE:
            if len(cleaned) > 35:
                return True
            if any(w in f" {lower} " for w in (" once ", " available ", " choose ", " report ", " inspect ", " vehicle ", " accident ", " loss ", " lose ")):
                return True
            return (
                self._is_label_only_value(cleaned)
                or bool(re.fullmatch(r"[A-Za-z!?]{1,10}", cleaned))
                or "proclaim" in lower
                or "sign off" in lower
                or "engineers report" in lower
                or "please " in lower
                or "before preparing" in lower
                or "your reports" in lower
                or "electronic basis" in lower
                or "report and fee" in lower
            )
        if field_key == FieldKey.INSPECTION_ADDRESS:
            # An image-based / desktop-assessment statement is a valid canonical
            # value, not junk narrative — never treat it as suspicious.
            if self._is_image_based_inspection(cleaned):
                return False
            # Precedence: when a real physical address (postcode) is present, the
            # image-based wording must not on its own blank a genuine address.
            # Strip only those phrases before the narrative check so other junk
            # (kind regards, confidentiality, ...) is still caught.
            if UK_POSTCODE_RE.search(cleaned):
                stripped = cleaned
                for phrase in _IMAGE_BASED_PHRASES:
                    stripped = re.sub(re.escape(phrase), " ", stripped, flags=re.IGNORECASE)
                return self._address_contains_narrative(stripped)
            return self._address_contains_narrative(cleaned)
        return False

    def _is_image_based_inspection(self, value: str) -> bool:
        """Return True when ``value`` is an image-based / desktop-assessment
        statement rather than a real physical inspection address.

        A genuine physical address must win: if the text carries a real UK
        postcode it is treated as an address (returns False) even if it also
        mentions image-based wording. Used to substitute the canonical
        ``IMAGE_BASED_ASSESSMENT`` value instead of blanking the field.
        """
        cleaned = clean_val(value)
        lower = cleaned.lower()
        if not any(phrase in lower for phrase in _IMAGE_BASED_PHRASES):
            return False
        # Precedence: a real physical address (signalled by a UK postcode) wins.
        if UK_POSTCODE_RE.search(cleaned):
            return False
        return True

    def _canonical_image_based_address(self, force_postcode: bool = False) -> str:
        """Canonical 6-line inspection-address value for an image-based assessment.

        Normalised through :func:`normalize_address` so the value still satisfies
        the 6-line EVA contract (e.g. ``"Image Based Assessment\\n\\n\\n\\n\\n"``).
        """
        return normalize_address(IMAGE_BASED_ASSESSMENT, force_postcode=force_postcode)

    def _address_contains_narrative(self, value: str) -> bool:
        lower = clean_val(value).lower()
        if "@" in lower:
            return True
        return any(
            phrase in lower
            for phrase in (
                "introducer",
                "i have advised",
                "please make arrangements",
                "please arrange",
                "please contact",
                "please do not hesitate",
                "you have any queries",
                "provide a report",
                "we await your report",
                "kind regards",
                "confidentiality",
                "addressee",
                "attachments",
                "stored on your computer",
                "solicitors regulation authority",
                "printing this email",
                "for images and inspection",
                "impact damage",
                "photographs",
                "standard terms",
                "terms and conditions",
                "image-based assessment",
                "desktop assessment",
                "recovery of damages",
                "circumstances of the accident",
                "\ntele:",
                "\ntel:",
                "\nmobile",
                "\nvehicle:",
                "\nreg:",
            )
        )

    def _fallback_field(self, document: DocumentModel, field_key: FieldKey) -> FieldExtraction:
        lines: list[DocumentLine] = []
        for page in document.pages:
            lines.extend(page.lines)
        text = document.plain_text or "\n".join(line.text for line in lines)
        lowered = text.lower()

        if field_key == FieldKey.VRM:
            return self._fallback_vrm(lines, text)
        if field_key == FieldKey.REFERENCE:
            return self._fallback_reference(lines)
        if field_key == FieldKey.CLAIMANT_NAME:
            return self._fallback_claimant_name(lines, document)
        if field_key == FieldKey.CLAIMANT_TELEPHONE:
            return self._fallback_telephone(lines, text)
        if field_key == FieldKey.CLAIMANT_EMAIL:
            return self._fallback_email(lines, text)
        if field_key == FieldKey.VEHICLE_MODEL:
            model = self._fallback_vehicle_model(lines)
            if model.value:
                return model
            return self._fallback_label_value(
                lines,
                ("vehicle model", "make/model", "make and model", "our client's vehicle", "our clients vehicle", "client vehicle", "vehicle make", "make", "model"),
                field_key,
                reject_labels={"model", "vehicle model", "make/model"},
            )
        if field_key == FieldKey.INSPECTION_ADDRESS:
            return self._fallback_address(lines)
        if field_key == FieldKey.INCIDENT_DATE:
            return self._fallback_context_date(lines, ("accident", "incident", "rta", "collision", "loss"), field_key)
        if field_key == FieldKey.INSTRUCTION_DATE:
            return self._fallback_context_date(lines, ("instruct", "received", "sent"), field_key)
        if field_key == FieldKey.VAT_STATUS and "vat" in lowered:
            if re.search(r"\b(no|not|non)\s+vat\b|vat\s+(?:no|not|none|exempt)", lowered):
                return FieldExtraction(value="No", raw_value="No", rule_id="fallback_vat_negative", confidence=0.65)
            return FieldExtraction(value="Yes", raw_value="Yes", rule_id="fallback_vat_positive", confidence=0.55)
        if field_key == FieldKey.MILEAGE_UNIT:
            if re.search(r"\b(km|kilomet(?:er|re)s?)\b", lowered):
                return FieldExtraction(value="Km", raw_value="Km", rule_id="fallback_mileage_unit", confidence=0.6)
            if re.search(r"\b(miles?|mi)\b", lowered):
                return FieldExtraction(value="Miles", raw_value="Miles", rule_id="fallback_mileage_unit", confidence=0.6)
        return FieldExtraction(value="", rule_id=f"fallback_{field_key.value}", confidence=0.0)

    def _fallback_label_value(
        self,
        lines: list[DocumentLine],
        labels: tuple[str, ...],
        field_key: FieldKey,
        reject_labels: set[str] | None = None,
    ) -> FieldExtraction:
        reject_labels = reject_labels or set()
        for label in labels:
            res = fuzzy_find_label(lines, label, threshold=0.72)
            if not res:
                continue
            idx, line, conf = res
            local_cfg = {"labels": [label]}
            same = self._extract_label_same_line(lines, local_cfg, f"fallback_{field_key.value}")
            if same.value and self._is_rejected_label_value(same.value, reject_labels):
                return FieldExtraction(value="", rule_id=f"fallback_{field_key.value}", confidence=0.0)
            candidates = [same.value] if same.value else []
            for next_line in lines[idx + 1:idx + 4]:
                value = clean_val(next_line.text)
                if value and not self._is_label_only_value(value):
                    candidates.append(value)
            for value in candidates:
                if self._is_rejected_label_value(value, reject_labels):
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id=f"fallback_{field_key.value}",
                    confidence=min(0.9, conf * 0.85),
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        return FieldExtraction(value="", rule_id=f"fallback_{field_key.value}", confidence=0.0)

    def _is_rejected_label_value(self, value: str, reject_labels: set[str]) -> bool:
        cleaned = clean_val(value).lower().strip(" :")
        if not cleaned or cleaned in reject_labels:
            return True
        if len(cleaned) <= 2:
            return True
        return False

    def _normalized_label_text(self, value: str) -> str:
        value = value.lower().replace("’", "'")
        value = re.sub(r"[^a-z0-9]+", " ", value)
        return re.sub(r"\s+", " ", value).strip()

    def _extract_value_after_structured_label(
        self,
        lines: list[DocumentLine],
        label_options: tuple[str, ...],
        rule_id: str,
        reject_labels: set[str] | None = None,
    ) -> FieldExtraction:
        normalized_options = [self._normalized_label_text(label) for label in label_options]
        reject_labels = reject_labels or set()
        for idx, line in enumerate(lines):
            normalized_line = self._normalized_label_text(line.text)
            matched_option = next(
                (
                    option
                    for option in normalized_options
                    if option
                    and (
                        option in normalized_line
                        if len(option.split()) > 1
                        else normalized_line == option or normalized_line.startswith(option + " ")
                    )
                ),
                "",
            )
            if not matched_option:
                continue
            same = ""
            if ":" in line.text:
                same = clean_val(line.text.rsplit(":", 1)[1])
            else:
                words = matched_option.split()
                parts = clean_val(line.text).split()
                if len(parts) > len(words):
                    same = clean_val(" ".join(parts[len(words):]))
            candidates = [same] if same and same != clean_val(line.text) else []
            if not same or self._is_label_only_value(same):
                for next_line in lines[idx + 1:idx + 5]:
                    value = clean_val(next_line.text)
                    if value and not self._is_label_only_value(value):
                        candidates.append(value)
            for value in candidates:
                if self._is_rejected_label_value(value, reject_labels):
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id=rule_id,
                    confidence=0.86,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        return FieldExtraction(value="", rule_id=rule_id, confidence=0.0)

    _EMAIL_SIGNOFF_PREFIX_RE = re.compile(
        r"^(?:"
        r"kind(?:est)?\s+regards|best\s+regards|warm\s+regards|regards|"
        r"yours\s+(?:faithfully|sincerely)|many\s+thanks|thanks|best\s+wishes|"
        r"all\s+the\s+best"
        r")\b(?P<remainder>.*)$",
        re.IGNORECASE,
    )
    _EMAIL_MOBILE_SIGNATURE_RE = re.compile(
        r"^sent\s+from\s+my(?:\s+[A-Za-z0-9'’._-]+){1,4}[.!]*$",
        re.IGNORECASE,
    )
    _EMAIL_THREAD_BOUNDARY_RE = re.compile(
        r"^(?:"
        r"[-_]{3,}(?:\s*(?:original|forwarded)\s+message\s*[-_]*)?|"
        r"begin\s+forwarded\s+message|"
        r"on\s+.+\s+wrote\s*:|"
        r"(?:from|sent|to|subject)\s*:\s*\S|"
        r">"
        r")",
        re.IGNORECASE,
    )
    _EMAIL_SIGNOFF_REMAINDER_STOPWORDS: frozenset[str] = frozenset(
        {
            "for",
            "the",
            "our",
            "your",
            "client",
            "claimant",
            "instruction",
            "message",
            "email",
            "help",
            "assistance",
            "attached",
            "update",
            "to",
            "and",
            "but",
            "if",
            "please",
            "report",
            "vehicle",
            "claim",
            "case",
        }
    )

    _CLAIMANT_PROSE_ANCHORS: tuple[re.Pattern[str], ...] = (
        re.compile(r"\bour\s+client\b\s*[:,\-–—]?\s*(.+)$", re.IGNORECASE),
        re.compile(
            r"\bwe\s+(?:act\s+for|represent)\s+"
            r"((?:(?:the|our)\s+)?(?:client|claimant)\b.+)$",
            re.IGNORECASE,
        ),
        re.compile(
            r"\bon\s+behalf\s+of\s+"
            r"((?:(?:the|our)\s+)?(?:client|claimant)\b.+)$",
            re.IGNORECASE,
        ),
    )

    _CLAIMANT_NAME_STOPWORDS: frozenset[str] = frozenset(
        {
            "was",
            "is",
            "has",
            "had",
            "will",
            "would",
            "no",
            "not",
            "the",
            "our",
            "client",
            "claimant",
            "named",
            "name",
            "who",
            "whose",
            "in",
            "at",
            "on",
            "for",
            "from",
            "of",
            "to",
            "and",
            "or",
            "with",
            "regarding",
            "following",
            "please",
            "about",
            "contact",
            "vehicle",
            "car",
            "vrm",
            "registration",
            "reg",
            "reference",
            "ref",
            "dob",
            "claim",
            "case",
            "accident",
            "requires",
            "needs",
            "requested",
            "requesting",
            "available",
            "claims",
            "handler",
            "team",
            "department",
            "services",
            "manager",
            "solicitor",
            "solicitors",
            "engineer",
            "repairer",
            "garage",
            "insured",
            "defendant",
            "third",
            "party",
        }
    )

    _CLAIMANT_ORGANISATION_MARKERS: frozenset[str] = frozenset(
        {
            "assurance",
            "bank",
            "claims",
            "company",
            "corp",
            "corporation",
            "engineers",
            "engineering",
            "finance",
            "garage",
            "group",
            "holdings",
            "inc",
            "incorporated",
            "insurance",
            "insurer",
            "law",
            "legal",
            "limited",
            "llp",
            "ltd",
            "plc",
            "services",
            "solicitors",
        }
    )

    def _is_standalone_email_signoff(self, value: str) -> bool:
        """True only for a standalone sign-off, optionally followed by a name.

        Prefix matching alone is unsafe: “Many thanks for the instruction, our client
        is …” is ordinary evidence, not a signature. A short name may share the sign-off
        line (``Kind regards, Alex Handler``); prose-like remainders are rejected.
        """
        cleaned = clean_val(value)
        if self._EMAIL_MOBILE_SIGNATURE_RE.fullmatch(cleaned):
            return True
        match = self._EMAIL_SIGNOFF_PREFIX_RE.fullmatch(cleaned)
        if not match:
            return False
        remainder = (match.group("remainder") or "").strip(" ,.!:;-–—")
        if not remainder:
            return True
        tokens = re.findall(r"[A-Za-z][A-Za-z'’.\-]*", remainder)
        if not 1 <= len(tokens) <= 4:
            return False
        return not any(
            token.lower().strip(".") in self._EMAIL_SIGNOFF_REMAINDER_STOPWORDS
            for token in tokens
        )

    def _is_email_thread_boundary(self, value: str) -> bool:
        return bool(self._EMAIL_THREAD_BOUNDARY_RE.match(clean_val(value)))

    def _email_signature_ranges(self, document: DocumentModel) -> tuple[tuple[int, int], ...]:
        """Return signature-only line ranges while preserving later quoted instructions.

        Each standalone sign-off starts a signature block. A reply/forward boundary ends
        that block, so claimant evidence in the quoted original remains available. Long
        dash rules are thread boundaries; only the exact RFC ``--`` delimiter starts a
        signature by itself.
        """
        if document.source_type not in {"eml", "msg"}:
            return ()
        lines = sorted(
            (line for page in document.pages for line in page.lines),
            key=lambda line: (line.page_index, line.line_index),
        )
        if not lines:
            return ()

        ranges: list[tuple[int, int]] = []
        final_end = max(line.line_index for line in lines) + 1
        for position, line in enumerate(lines):
            cleaned = clean_val(line.text)
            if not (self._is_standalone_email_signoff(cleaned) or cleaned == "--"):
                continue
            end = final_end
            for next_line in lines[position + 1:]:
                if self._is_email_thread_boundary(next_line.text):
                    end = next_line.line_index
                    break
            ranges.append((line.line_index, end))
        return tuple(ranges)

    def _source_is_in_email_signature(
        self,
        document: DocumentModel,
        source_span: SourceSpan | None,
    ) -> bool:
        if source_span is None or source_span.line_index is None:
            return False
        return any(
            start <= source_span.line_index < end
            for start, end in self._email_signature_ranges(document)
        )

    def _claimant_lines_without_signatures(
        self,
        lines: list[DocumentLine],
        document: DocumentModel,
    ) -> list[DocumentLine]:
        ranges = self._email_signature_ranges(document)
        if not ranges:
            return lines
        return [
            line
            for line in lines
            if not any(start <= line.line_index < end for start, end in ranges)
        ]

    def _fallback_claimant_label(self, lines: list[DocumentLine]) -> FieldExtraction:
        """Read explicit claimant/client labels, never a bare ``Name`` label.

        Bare ``Name:`` is common in staff e-mail signatures and carried the exact false
        positive behind TKT-150. Provider-specific layouts may still define a Name rule;
        the signature-span guard above rejects it when its source is a sign-off.
        """
        # The generic fallback deliberately excludes ``our insured`` and
        # ``policyholder``: CollisionSpike carries insuredName as a separate fact.
        # Reviewed provider profiles (FW/PCH/SBL) explicitly map those aliases in
        # their OWN field rules where the layout contract proves they mean claimant.
        label_re = re.compile(
            r"^\s*(?:re\s*:\s*)?(?:"
            r"claimant(?:'s)?(?:\s+name)?|name\s+of\s+(?:the\s+)?claimant|"
            r"client\s+name|our\s+client|re\s+client"
            r")\s*(?:[:|\-–—]\s*(.*))?$",
            re.IGNORECASE,
        )
        for index, line in enumerate(lines):
            line_text = re.sub(r"^\s*>+\s*", "", line.text)
            match = label_re.match(line_text)
            if not match:
                continue
            candidates = [(clean_val(match.group(1) or ""), line)]
            if not candidates[0][0]:
                # Follow an empty label to the first non-empty line only. If that
                # line is prose rather than a name, it is intervening content and
                # must stop the search instead of allowing a later unrelated name.
                for next_line in lines[index + 1:index + 4]:
                    next_value = clean_val(next_line.text)
                    if not next_value:
                        continue
                    candidates.append((next_value, next_line))
                    break
            for value, value_line in candidates:
                # A label proves the field, not that the entire remainder is a name.
                # Same-line and following-line values frequently continue straight into
                # instruction prose (for example, ``Mr J Sample requires inspection``).
                # Reuse the conservative prose parser so only the leading person name is
                # accepted and prose-only following lines remain blank.
                cleaned_value = self._clean_claimant_name(value)
                if self._is_claimant_placeholder(cleaned_value):
                    continue
                value = self._person_name_prefix(
                    cleaned_value,
                    allow_single_token=True,
                )
                if not value or self._is_label_only_value(value):
                    continue
                if re.fullmatch(r"[A-Z]{1,3}\d{1,3}\s?[A-Z]{3}", value, re.IGNORECASE):
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_claimant_label",
                    confidence=0.9,
                    source_span=SourceSpan(
                        page_index=value_line.page_index,
                        line_index=value_line.line_index,
                        bbox=value_line.bbox,
                    ),
                )
        return FieldExtraction(value="", rule_id="fallback_claimant_label", confidence=0.0)

    def _person_name_prefix(
        self,
        value: str,
        *,
        allow_single_token: bool = False,
    ) -> str:
        """Conservatively take a person-name prefix from instruction text.

        A single token is accepted only when an explicit claimant/client label has
        already established the field. Generic prose still requires a title or at
        least two name tokens. Organisation and legal-form markers reject the whole
        candidate rather than returning a misleading prefix before the marker.
        """
        value = re.sub(r"^[\s,:;\-–—]+", "", value)
        # ``we act for`` / ``on behalf of`` often introduce the person through
        # intermediary words. Consume those words; merely declaring them stopwords
        # would stop at the first token and miss the actual name that follows.
        for _ in range(2):
            shortened = re.sub(
                r"^(?:(?:the|our)\s+)?(?:client|claimant)\b"
                r"(?:\s+(?:is|named))?\s*[:,;\-–—]*\s*",
                "",
                value,
                flags=re.IGNORECASE,
            )
            shortened = re.sub(
                r"^(?:is|named)\b\s*[:,;\-–—]*\s*",
                "",
                shortened,
                flags=re.IGNORECASE,
            )
            if shortened == value:
                break
            value = shortened
        token_matches = list(re.finditer(r"[A-Za-z][A-Za-z'’.\-]*", value))
        if not token_matches:
            return ""

        title = ""
        chosen: list[re.Match[str]] = []
        first = token_matches[0].group(0).rstrip(".")
        start = 0
        if first.lower() in {"mr", "mrs", "miss", "ms", "mx", "dr"}:
            title = token_matches[0].group(0)
            start = 1

        prefix_matches: list[re.Match[str]] = []
        organisation_marker_seen = False
        for match in token_matches[start:]:
            token = match.group(0).strip(".")
            if token.lower() in self._CLAIMANT_ORGANISATION_MARKERS:
                organisation_marker_seen = True
                break
            if token.lower() in self._CLAIMANT_NAME_STOPWORDS:
                break
            prefix_matches.append(match)

        if organisation_marker_seen:
            return ""
        chosen.extend(prefix_matches[:4])
        minimum = 1 if title or allow_single_token else 2
        if len(chosen) < minimum:
            return ""
        end = chosen[-1].end()
        candidate = clean_val(value[:end]).rstrip(".,;:")
        candidate_tokens = {token.lower().strip(".") for token in re.findall(r"[A-Za-z][A-Za-z'’.\-]*", candidate)}
        if candidate_tokens & self._CLAIMANT_NAME_STOPWORDS:
            return ""
        return self._clean_claimant_name(candidate)

    def _fallback_claimant_name(
        self,
        lines: list[DocumentLine],
        document: DocumentModel,
    ) -> FieldExtraction:
        usable_lines = self._claimant_lines_without_signatures(lines, document)

        # Strong, explicit evidence wins even when weaker prose appears earlier.
        labelled = self._fallback_claimant_label(usable_lines)
        if labelled.value:
            return labelled

        for line in usable_lines:
            for pattern in self._CLAIMANT_PROSE_ANCHORS:
                match = pattern.search(line.text)
                if not match:
                    continue
                value = self._person_name_prefix(match.group(1))
                if not value:
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_claimant_prose",
                    confidence=0.78,
                    source_span=SourceSpan(
                        page_index=line.page_index,
                        line_index=line.line_index,
                        bbox=line.bbox,
                    ),
                )

        available_re = re.compile(
            r"\b((?:Mr|Mrs|Miss|Ms|Mx|Dr)\s+[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,4})\s+is\s+available\b"
        )
        for line in usable_lines:
            match = available_re.search(line.text)
            if match:
                value = clean_val(match.group(1))
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_claimant_available",
                    confidence=0.74,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        return FieldExtraction(value="", rule_id="fallback_claimant_name", confidence=0.0)

    def _fallback_vehicle_model(self, lines: list[DocumentLine]) -> FieldExtraction:
        for line in lines:
            match = re.match(r"^\s*Vehicle\s*:\s*(.+?)\s*$", line.text, re.IGNORECASE)
            if not match:
                continue
            value = clean_val(match.group(1))
            if self._is_rejected_label_value(value, {"vehicle", "model", "make/model"}):
                continue
            if normalize_vrm(value) == value.replace(" ", "").upper() and re.fullmatch(r"[A-Z]{1,3}\d{1,3}[A-Z]{3}", normalize_vrm(value)):
                continue
            return FieldExtraction(
                value=value,
                raw_value=value,
                rule_id="fallback_vehicle_model_exact_vehicle",
                confidence=0.78,
                source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
            )
        return self._extract_value_after_structured_label(
            lines,
            ("make/model", "make model", "our client's vehicle", "our clients vehicle", "client vehicle", "vehicle make", "vehicle model", "make"),
            "fallback_vehicle_model_structured",
            reject_labels={"model", "make", "vehicle", "vehicle model", "make/model"},
        )

    def _fallback_vrm(self, lines: list[DocumentLine], text: str) -> FieldExtraction:
        label_result = self._fallback_vrm_from_labels(lines)
        if label_result.value:
            return label_result
        context_words = ("reg", "registration", "vrm", "vehicle")
        for line in lines:
            lower = line.text.lower()
            if "located" in lower or "postcode" in lower or UK_POSTCODE_RE.search(line.text):
                continue
            if any(word in lower for word in context_words):
                match = VRM_RE.search(line.text)
                if match and not vrm_document_candidate_is_bad(
                    match.group(1), line.text, match.start(1), match.end(1)
                ):
                    value = clean_val(match.group(1))
                    return FieldExtraction(
                        value=value,
                        raw_value=value,
                        rule_id="fallback_vrm_context",
                        confidence=0.78,
                        source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                    )
        match = VRM_RE.search(text)
        if match and not vrm_document_candidate_is_bad(match.group(1), text, match.start(1), match.end(1)):
            value = clean_val(match.group(1))
            return FieldExtraction(value=value, raw_value=value, rule_id="fallback_vrm_document", confidence=0.52)
        return FieldExtraction(value="", rule_id="fallback_vrm", confidence=0.0)

    def _fallback_vrm_from_labels(self, lines: list[DocumentLine]) -> FieldExtraction:
        labels = ("vehicle registration number", "vehicle registration", "registration", "vehicle reg", "client reg", "vrm", "reg")
        for label in labels:
            res = fuzzy_find_label(lines, label, threshold=0.72)
            if not res:
                continue
            idx, line, conf = res
            search_lines = [line] + lines[idx + 1:idx + 4]
            for candidate_line in search_lines:
                if self._is_label_only_value(candidate_line.text):
                    continue
                match = VRM_RE.search(candidate_line.text)
                if not match:
                    continue
                # TKT-136 addendum: the fuzzy-matched VRM label is the TKT-071
                # anchor by construction — pass the label line as the anchor
                # scope (a label like "Vehicle Registration Number" overflows
                # the flowing-text 16-char window). For a value on a FOLLOWING
                # line the label also rides in the trigram context window via
                # the joined prefix.
                if candidate_line is line:
                    ctx_text, offset = candidate_line.text, 0
                    anchor_text = line.text[:match.start(1)]
                else:
                    prefix = line.text.rstrip() + " "
                    ctx_text, offset = prefix + candidate_line.text, len(prefix)
                    anchor_text = line.text
                if not vrm_document_candidate_is_bad(
                    match.group(1),
                    ctx_text,
                    match.start(1) + offset,
                    match.end(1) + offset,
                    anchor_text=anchor_text,
                ):
                    value = clean_val(match.group(1))
                    return FieldExtraction(
                        value=value,
                        raw_value=value,
                        rule_id="fallback_vrm_label",
                        confidence=min(0.88, conf * 0.9),
                        source_span=SourceSpan(page_index=candidate_line.page_index, line_index=candidate_line.line_index, bbox=candidate_line.bbox),
                    )
        return FieldExtraction(value="", rule_id="fallback_vrm_label", confidence=0.0)

    def _vrm_candidate_is_bad(self, candidate: str, context: str) -> bool:
        return vrm_candidate_is_bad(candidate, context)

    def _reference_value_is_junk(self, value: str, preceding: str = "") -> bool:
        """TKT-136: a fallback-reference candidate that is money-shaped or a
        prose/spec fragment must never be minted, on ANY tier."""
        return reference_candidate_is_money(value, preceding) or reference_candidate_is_fragment(value)

    def _fallback_reference(self, lines: list[DocumentLine]) -> FieldExtraction:
        labels = ("reference", "ref", "claim no", "claim number", "case number", "our ref", "your ref")
        exact_label_re = re.compile(r"^\s*(?:our|your)?\s*ref(?:erence)?\s*:\s*(.+?)\s*$", re.IGNORECASE)
        subject_ref_re = re.compile(r"\bour\s+ref\s*:\s*([A-Z0-9./-]+(?:/[A-Z0-9.-]+)*)", re.IGNORECASE)
        slash_ref_re = re.compile(r"\b[A-Z]{1,4}(?:/[A-Z0-9.-]{1,8}){2,}\b", re.IGNORECASE)
        for line in lines[:10]:
            if not line.text.lower().startswith("subject:"):
                continue
            match = subject_ref_re.search(line.text) or slash_ref_re.search(line.text)
            if match:
                group = 1 if match.lastindex else 0
                value = clean_val(match.group(group))
                if self._reference_value_is_junk(value, line.text[:match.start(group)]):
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_reference_subject",
                    confidence=0.78,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        label_only_ref_re = re.compile(r"^\s*(?:our|your)?\s*ref(?:erence)?\s*:\s*$", re.IGNORECASE)
        for idx, line in enumerate(lines[:30]):
            match = exact_label_re.match(line.text)
            if match:
                value = clean_val(match.group(1))
                if self._is_rejected_label_value(value, {"ref", "reference", "our ref", "your ref"}):
                    continue
                if self._reference_value_is_junk(value, line.text[:match.start(1)]):
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_reference_exact_label",
                    confidence=0.84,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
            if label_only_ref_re.match(line.text):
                for next_line in lines[idx + 1:idx + 4]:
                    value = clean_val(next_line.text)
                    if not value or self._is_label_only_value(value) or value.lower().startswith("page "):
                        continue
                    if not (re.search(r"\d", value) and re.fullmatch(r"[A-Z0-9./ -]+", value, re.IGNORECASE)):
                        continue
                    if self._reference_value_is_junk(value):
                        continue
                    return FieldExtraction(
                        value=value,
                        raw_value=value,
                        rule_id="fallback_reference_next_line",
                        confidence=0.76,
                        source_span=SourceSpan(page_index=next_line.page_index, line_index=next_line.line_index, bbox=next_line.bbox),
                    )
        by_label = self._fallback_label_value(lines, labels, FieldKey.REFERENCE)
        # TKT-136: the fuzzy label tier is where the live "RIGERANT R1234YF" was
        # minted — the substring "ref" label matched the head of "REFRIGERANT
        # R1234YF 650g" and the rest of the parts line became the reference. A
        # money/fragment value from this tier falls through to tier 4 instead.
        if by_label.value and not self._reference_value_is_junk(by_label.value):
            return by_label
        ref_re = re.compile(r"\b(?:[A-Z]{2,6}[-/ ]?)?\d{4,}[A-Z0-9/-]*\b", re.IGNORECASE)
        # TKT-136: cue words match on WORD BOUNDARIES — the old substring test
        # made "refrigerant" contain "ref" and turned a parts line into a
        # reference cue. Plural forms stay covered explicitly.
        ref_cue_re = re.compile(r"\b(?:references?|claims?|refs?|cases?)\b", re.IGNORECASE)
        for line in lines[:25]:
            if ref_cue_re.search(line.text):
                match = ref_re.search(line.text)
                if match:
                    value = clean_val(match.group(0))
                    if self._reference_value_is_junk(value, line.text[:match.start()]):
                        continue
                    return FieldExtraction(
                        value=value,
                        raw_value=value,
                        rule_id="fallback_reference_pattern",
                        confidence=0.65,
                        source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                    )
        return FieldExtraction(value="", rule_id="fallback_reference", confidence=0.0)

    def _fallback_context_date(self, lines: list[DocumentLine], context_words: tuple[str, ...], field_key: FieldKey) -> FieldExtraction:
        for idx, line in enumerate(lines):
            lower = line.text.lower()
            if not any(word in lower for word in context_words):
                continue
            search_lines = [line] + lines[idx + 1:idx + 3]
            for candidate_line in search_lines:
                match = DATE_RE.search(candidate_line.text)
                if match:
                    value = clean_val(match.group(0))
                    return FieldExtraction(
                        value=value,
                        raw_value=value,
                        rule_id=f"fallback_{field_key.value}_context",
                        confidence=0.7,
                        source_span=SourceSpan(
                            page_index=candidate_line.page_index,
                            line_index=candidate_line.line_index,
                            bbox=candidate_line.bbox,
                        ),
                    )
                normalized = normalize_date(candidate_line.text)
                if normalized and normalized != candidate_line.text and re.fullmatch(r"\d{2}/\d{2}/\d{4}", normalized):
                    return FieldExtraction(
                        value=normalized,
                        raw_value=candidate_line.text,
                        rule_id=f"fallback_{field_key.value}_context",
                        confidence=0.65,
                        source_span=SourceSpan(
                            page_index=candidate_line.page_index,
                            line_index=candidate_line.line_index,
                            bbox=candidate_line.bbox,
                        ),
                    )
        for line in lines[:20]:
            match = DATE_RE.search(line.text)
            if match:
                value = clean_val(match.group(0))
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id=f"fallback_{field_key.value}_top_date",
                    confidence=0.5,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
            normalized = normalize_date(line.text)
            if normalized and normalized != line.text and re.fullmatch(r"\d{2}/\d{2}/\d{4}", normalized):
                return FieldExtraction(
                    value=normalized,
                    raw_value=line.text,
                    rule_id=f"fallback_{field_key.value}_top_date",
                    confidence=0.5,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        return FieldExtraction(value="", rule_id=f"fallback_{field_key.value}", confidence=0.0)

    # Words that mark the line (or a nearby anchor line) as being about the
    # CLAIMANT / INSURED / CLIENT, used to scope telephone & email extraction so
    # we prefer the claimant's contact details over a solicitor's switchboard.
    _CLAIMANT_CONTEXT_WORDS: tuple[str, ...] = (
        "claimant",
        "our client",
        "our insured",
        "insured",
        "client",
        "policyholder",
        "driver",
        "owner",
    )

    # Labels that explicitly introduce the claimant's own contact details.
    _CLAIMANT_CONTACT_LABELS: tuple[str, ...] = (
        "claimant tel",
        "claimant telephone",
        "claimant mobile",
        "claimant contact",
        "claimant email",
        "client tel",
        "client telephone",
        "client mobile",
        "client email",
        "insured tel",
        "insured telephone",
        "insured mobile",
        "insured email",
    )

    def _line_has_claimant_context(self, line_text: str) -> bool:
        lower = line_text.lower()
        return any(word in lower for word in self._CLAIMANT_CONTEXT_WORDS)

    def _is_non_claimant_email(self, email: str, lines: list[DocumentLine]) -> bool:
        """Reject our own and provider / team inbox addresses that are not the claimant's."""
        lower_email = email.lower()
        domain = lower_email.rsplit("@", 1)[-1]
        if any(
            domain == own or domain.endswith("." + own)
            for own in _OWN_EMAIL_DOMAINS
        ):
            return True
        if re.search(
            r"(?:team[_-]?inbox|[_-]inbox@|noreply@|no-reply@|servicedesk@|engineersinspections@)",
            lower_email,
        ):
            return True
        for idx, line in enumerate(lines):
            if email.lower() not in line.text.lower():
                continue
            context = " ".join(l.text.lower() for l in lines[max(0, idx - 3): idx + 1])
            if any(
                phrase in context
                for phrase in (
                    "credit repair",
                    "contact the",
                    "by email on",
                    "team on",
                    "report suspicious",
                    "servicedesk",
                )
            ):
                return True
        return False

    def _fallback_telephone(self, lines: list[DocumentLine], text: str) -> FieldExtraction:
        """Derive the claimant telephone from document text, scoped to context.

        Preference order (all provenanced via rule_id):
          1. an explicit claimant/client/insured telephone LABEL with a number;
          2. a phone number on / just after a line that mentions the claimant;
          3. (only if exactly one phone exists in the whole document) that number.
        Returns empty when nothing plausible is found — staff fill it in.
        """
        # 1. Explicit claimant/client/insured contact label on the same line.
        contact_label_re = re.compile(
            r"(?:claimant|client|insured)\s*(?:tel(?:ephone)?|mobile|phone|contact)\s*(?:no\.?|number)?\s*[:\-]?\s*(.+)",
            re.IGNORECASE,
        )
        for line in lines:
            match = contact_label_re.search(line.text)
            if not match:
                continue
            number = normalize_telephone(match.group(1))
            if number:
                return FieldExtraction(
                    value=number,
                    raw_value=clean_val(match.group(1)),
                    rule_id="fallback_telephone_claimant_label",
                    confidence=0.85,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )

        # 2. A phone number on, or within two lines of, a claimant-context line.
        for idx, line in enumerate(lines):
            if not self._line_has_claimant_context(line.text):
                continue
            for candidate_line in [line] + lines[idx + 1:idx + 3]:
                tel_match = TELEPHONE_RE.search(candidate_line.text)
                if not tel_match:
                    continue
                number = normalize_telephone(tel_match.group(1))
                if number:
                    return FieldExtraction(
                        value=number,
                        raw_value=clean_val(tel_match.group(1)),
                        rule_id="fallback_telephone_context",
                        confidence=0.68,
                        source_span=SourceSpan(
                            page_index=candidate_line.page_index,
                            line_index=candidate_line.line_index,
                            bbox=candidate_line.bbox,
                        ),
                    )

        # 3. Unambiguous fallback: exactly one phone number in the whole document.
        unique = self._unique_normalized_matches(text, TELEPHONE_RE, normalize_telephone)
        if len(unique) == 1:
            value, raw, line = unique[0](lines)
            return FieldExtraction(
                value=value,
                raw_value=raw,
                rule_id="fallback_telephone_sole",
                confidence=0.5,
                source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox) if line else None,
            )
        return FieldExtraction(value="", rule_id="fallback_claimant_telephone", confidence=0.0)

    def _fallback_email(self, lines: list[DocumentLine], text: str) -> FieldExtraction:
        """Derive the claimant email from document text, scoped to context.

        Preference order (all provenanced via rule_id):
          1. an explicit claimant/client/insured email LABEL with an address;
          2. an address on / just after a line that mentions the claimant;
          3. (only if exactly one address exists in the whole document) that one.
        Returns empty when nothing plausible is found — staff fill it in.
        """
        # 1. Explicit claimant/client/insured email label on the same line.
        email_label_re = re.compile(
            r"(?:claimant|client|insured)\s*(?:e-?mail)\s*(?:address)?\s*[:\-]?\s*(.+)",
            re.IGNORECASE,
        )
        for line in lines:
            match = email_label_re.search(line.text)
            if not match:
                continue
            email = normalize_email(match.group(1))
            if email and not self._is_non_claimant_email(email, lines):
                return FieldExtraction(
                    value=email,
                    raw_value=clean_val(match.group(1)),
                    rule_id="fallback_email_claimant_label",
                    confidence=0.85,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )

        # 2. An email on, or within two lines of, a claimant-context line.
        for idx, line in enumerate(lines):
            if not self._line_has_claimant_context(line.text):
                continue
            for candidate_line in [line] + lines[idx + 1:idx + 3]:
                email_match = EMAIL_RE.search(candidate_line.text)
                if not email_match:
                    continue
                email = normalize_email(email_match.group(1))
                if email and not self._is_non_claimant_email(email, lines):
                    return FieldExtraction(
                        value=email,
                        raw_value=clean_val(email_match.group(1)),
                        rule_id="fallback_email_context",
                        confidence=0.68,
                        source_span=SourceSpan(
                            page_index=candidate_line.page_index,
                            line_index=candidate_line.line_index,
                            bbox=candidate_line.bbox,
                        ),
                    )

        # 3. Unambiguous fallback: exactly one email address in the whole document.
        unique = self._unique_normalized_matches(text, EMAIL_RE, normalize_email)
        if len(unique) == 1:
            value, raw, line = unique[0](lines)
            if not self._is_non_claimant_email(value, lines):
                return FieldExtraction(
                    value=value,
                    raw_value=raw,
                    rule_id="fallback_email_sole",
                    confidence=0.5,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox) if line else None,
                )
        return FieldExtraction(value="", rule_id="fallback_claimant_email", confidence=0.0)

    def _unique_normalized_matches(self, text: str, pattern: re.Pattern[str], normalizer) -> list:
        """Return one resolver per DISTINCT normalised match of ``pattern`` in ``text``.

        Each entry is a callable ``lines -> (value, raw, DocumentLine|None)`` so
        the caller can attach a source span only when a single match remains
        (keeps the "sole occurrence" fallback cheap and side-effect free).
        """
        seen: dict[str, str] = {}
        for match in pattern.finditer(text):
            raw = match.group(1) if match.groups() else match.group(0)
            norm = normalizer(raw)
            if norm and norm not in seen:
                seen[norm] = clean_val(raw)

        resolvers = []
        for norm_value, raw_value in seen.items():
            def make(norm_value=norm_value, raw_value=raw_value):
                def resolve(lines: list[DocumentLine]):
                    for line in lines:
                        if raw_value and raw_value.split()[0] in line.text:
                            return norm_value, raw_value, line
                    return norm_value, raw_value, None
                return resolve
            resolvers.append(make())
        return resolvers

    def _fallback_address(self, lines: list[DocumentLine]) -> FieldExtraction:
        labels = ("inspection address", "address", "location", "repairer", "garage", "bodyshop")
        for label in labels:
            res = fuzzy_find_label(lines, label, threshold=0.72)
            if not res:
                continue
            idx, line, conf = res
            if self._address_contains_narrative(line.text):
                continue
            collected: list[str] = []
            same = self._extract_label_same_line(lines, {"labels": [label]}, "fallback_inspection_address")
            if same.value:
                collected.append(same.value)
            if same.value and UK_POSTCODE_RE.search(same.value):
                value = clean_val("\n".join(collected))
                if value and not self._address_contains_narrative(value):
                    return FieldExtraction(
                        value=value,
                        raw_value=value,
                        rule_id="fallback_inspection_address",
                        confidence=min(0.82, conf * 0.8),
                        source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                    )
            for next_line in lines[idx + 1:idx + 8]:
                value = clean_val(next_line.text)
                if not value:
                    if collected:
                        break
                    continue
                value_lower = value.lower()
                if (
                    DATE_RE.search(value)
                    or value_lower in {"tel", "telephone", "email"}
                    or value_lower.startswith(("tel:", "tele:", "telephone:", "mobile", "email:", "vehicle:", "reg:"))
                ):
                    break
                if self._address_contains_narrative(value):
                    if collected:
                        break
                    continue
                collected.append(value)
                if UK_POSTCODE_RE.search(value):
                    break
            value = clean_val("\n".join(collected))
            if value and not self._address_contains_narrative(value) and (UK_POSTCODE_RE.search(value) or len(collected) >= 2):
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_inspection_address",
                    confidence=min(0.82, conf * 0.8),
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        for idx, line in enumerate(lines):
            if UK_POSTCODE_RE.search(line.text):
                collected: list[str] = []
                for prev in reversed(lines[max(0, idx - 5):idx]):
                    prev_value = clean_val(prev.text)
                    if not prev_value:
                        continue
                    prev_lower = prev_value.lower()
                    if any(
                        phrase in prev_lower
                        for phrase in (
                            "available at",
                            "introducer",
                            "please make arrangements",
                            "please arrange",
                            "provide a report",
                            "i have advised",
                        )
                    ):
                        if collected:
                            break
                        continue
                    if len(prev_value.split()) > 9:
                        if collected:
                            break
                        continue
                    if self._address_contains_narrative(prev_value):
                        if collected:
                            break
                        continue
                    collected.insert(0, prev_value)
                    if len(collected) >= 3:
                        break
                collected.append(clean_val(line.text))
                value = clean_val("\n".join(collected))
                if self._address_contains_narrative(value):
                    continue
                return FieldExtraction(
                    value=value,
                    raw_value=value,
                    rule_id="fallback_address_postcode_block",
                    confidence=0.6,
                    source_span=SourceSpan(page_index=line.page_index, line_index=line.line_index, bbox=line.bbox),
                )
        return FieldExtraction(value="", rule_id="fallback_inspection_address", confidence=0.0)
