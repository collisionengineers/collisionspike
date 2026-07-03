"""Content-based attachment typing (collisionspike rules-engine-v2 plan, Phase 3).

A single PURE function -- :func:`type_document_text` -- that reads a document's
already-extracted plain text and types it as an ``instruction``, a ``report``,
``junk``, or ``unknown`` attachment, by CONTENT alone. It reuses the SAME
provider ``detect_phrases`` corpus (:class:`cedocumentmapper_v2.detection.
detector.ProviderDetector`) and the SAME instruction-wording keyword tuple
(``_WORK_KEYWORDS`` in :mod:`cedocumentmapper_v2.rules.engine`) the rest of the
engine already uses -- no new phrase-matching machinery, no duplicated
constants.

Motivation. Today the only report-vs-instruction discriminator anywhere in the
collisionspike pipeline is the email classifier's ``_REPORT_FILENAME_RE`` -- a
regex over the attachment's FILENAME ("Engineer Report.pdf" reads as a report;
"instruction.pdf" does not). That is fragile (a report saved as "scan001.pdf"
is invisible to it) and narrow (it never runs on the document text the parser
actually opens). This module gives a second, content-based opinion, typed from
the extracted text alone -- the caller never passes a filename in, and this
function never looks for one.

Deterministic, pure, no I/O: takes the caller's already-extracted ``text`` and
an already-loaded provider ``catalog`` (the dict
:meth:`cedocumentmapper_v2.application.service.DocumentMapperService.
load_provider_catalog` returns, or a bare list of provider dicts in the same
v2 shape) and returns a plain, JSON-serialisable dict. No filesystem, no
network, no randomness, no reliance on wall-clock time.

Signal precedence (first rule that fires wins; see the inline comments in
:func:`type_document_text` for the full reasoning):

    1. REPORT       -- the text reads as an engineer's report.
    2. INSTRUCTION  -- a provider was recognised, OR the text carries strong
                       instruction wording.
    3. JUNK         -- marketing / automated-content boilerplate.
    4. UNKNOWN      -- none of the above (the safe default -- mirrors the rest
                       of the engine's abstain-to-unidentified bias; see
                       ``rules/email_classifier.py``'s module docstring).

Why REPORT is checked before INSTRUCTION. A genuine report and the instruction
that commissioned it can share vocabulary: "please provide an engineer's
report" (a REQUEST -- mined into ``_WORK_KEYWORDS`` for a different rule
already) and "Engineer's Report" (a report's own title/heading) are the same
few words read two different ways. REPORT wins the tie because a report's own
title is the more SPECIFIC of the two signals -- a real report's front matter
almost always carries one of a small, closed set of title phrases, while
"asking for one" is a much larger, vaguer bucket of request-shaped phrasing.
This mirrors the corroboration-gate discipline ``rules.email_classifier.
classify_email`` Rule 1 already applies to instruction documents (a signal is
necessary but not always sufficient): here a WEAK report signal (body
"structure" wording alone) is not enough either -- it must be corroborated by
a detected ``engineer_report`` provider (CNX / EVA in the live corpus) --
while a STRONG, specific title phrase stands on its own, no corroboration
required.

Consumer note -- NOT solved here, a pure text function cannot see it. The
collisionspike email-intake pipeline classifies the EMAIL *before* it parses
any attached DOCUMENT (email classification is orchestration step 1.5; the
document parser's ``/parse`` route runs at step 4), so this module's output
cannot feed back into ``classify_email``'s Rule 1 corroboration gate without a
pipeline reorder -- that is out of scope for this module and is tracked as a
follow-up on the collisionspike side (see that repo's
``functions/parser/cedocumentmapper_v2/PROVENANCE.md`` and
``docs/plans/rules_engine_v2_plan_9ba034c4.plan.md``, Phase 3). What this
module DOES do: give a `/parse`-time, content-based typing that a downstream
resolve/identification layer or telemetry pipeline can consume today.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cedocumentmapper_v2.detection.detector import ProviderDetector
from cedocumentmapper_v2.domain.models import DocumentModel
from cedocumentmapper_v2.rules.engine import _WORK_KEYWORDS, _match_keywords
from cedocumentmapper_v2.rules.triage_rules import load_triage_rules

# Externalized phrase data (collisionspike rules-engine-v2 plan, Phase 5) -- see
# the matching comment in rules/engine.py. This module's own three phrase
# collections (below) are sourced from the same schema-validated
# resources/triage-rules.json.
_RULES = load_triage_rules()

# doc_type constants -- mirrors the CATEGORY_*/SUBTYPE_* constant convention in
# rules/email_classifier.py.
DOC_TYPE_INSTRUCTION = "instruction"
DOC_TYPE_REPORT = "report"
DOC_TYPE_JUNK = "junk"
DOC_TYPE_UNKNOWN = "unknown"

# --- Report title phrases (Rule 1a) ------------------------------------------
# A genuine engineer's report's own front-matter / heading. High-precision on
# purpose, mirroring the ``_AUDIT_PHRASES`` / ``_SUMMARY_MARKERS`` discipline
# elsewhere in the engine: these are REPORT-TITLE-shaped, not the bare word
# "report" (which appears constantly in ordinary correspondence -- "please
# provide a report", "your report is attached"). Strong enough to stand
# alone -- no provider corroboration required. NOTE the deliberate literal
# overlap with two ``_WORK_KEYWORDS`` entries ("engineer's report" /
# "engineers report") -- see the module docstring for why REPORT is checked
# before INSTRUCTION; this is not a bug, it is the tie-break.
_REPORT_TITLE_PHRASES: tuple[str, ...] = _RULES.report_title_phrases

# --- Report structure phrases (Rule 1b) --------------------------------------
# Weaker, body-of-report wording -- plausible in a report's findings/opinion
# section but not in an instruction letter or a query. DELIBERATELY not
# strong enough to promote a document to 'report' alone (see Rule 1 in
# type_document_text): it only counts when the detected provider's own config
# also marks it an ``engineer_report`` source (CNX / EVA in the live
# providers.json corpus) -- exactly the "provider detect_phrases /
# engineer_report markers" pairing the Phase-3 plan calls for. Kept small.
_REPORT_STRUCTURE_PHRASES: tuple[str, ...] = _RULES.report_structure_phrases

# --- Junk / marketing markers (Rule 3) ---------------------------------------
# Kept TINY and conservative per the Phase-3 plan -- a false 'junk' call on
# genuine correspondence is worse than a missed one (the 'unknown' bucket is
# always the safe fallback, mirroring the engine-wide abstain bias). Distinct
# from ``email_classifier._AUTO_REPLY_MARKERS`` (out-of-office / bounce
# wording, a different signal for a different rule) -- this is
# marketing/newsletter FOOTER boilerplate.
_JUNK_PHRASES: tuple[str, ...] = _RULES.junk_phrases


def type_document_text(text: str, catalog: Any) -> dict[str, Any]:
    """Type ``text`` as instruction/report/junk/unknown by CONTENT alone.

    Args:
        text: the document's already-extracted plain text (whatever the
            caller has on hand -- ``DocumentModel.plain_text`` for a parsed
            attachment, or any other already-decoded text). Filename is
            deliberately NOT an input here -- see the module docstring.
        catalog: the provider catalogue, in the shape
            ``DocumentMapperService.load_provider_catalog()`` returns
            (``{"providers": [...]}``) or a bare ``[...]`` list of provider
            dicts in the same v2 shape (``id`` / ``name`` / ``detect`` /
            ``engineer_report``). Reuses :class:`ProviderDetector` -- the SAME
            detector the engine already runs for field-extraction provider
            resolution -- so a document's attachment-typing provider always
            agrees with its extraction record's provider match.

    Returns:
        ``{"doc_type": "instruction" | "report" | "junk" | "unknown",
        "provider_name": str | None, "markers": [str, ...]}``. ``markers``
        lists exactly which phrase(s) / provider fired -- explainable,
        mirroring ``classify_email``'s ``signals`` list.
    """
    providers = _providers_from_catalog(catalog)
    haystack = text or ""

    match = ProviderDetector().detect(_pseudo_document(haystack), providers)
    provider_name = match.provider_name if match.provider_id else None
    provider_cfg = (
        next((p for p in providers if p.get("id") == match.provider_id), None)
        if match.provider_id
        else None
    )

    markers: list[str] = []

    # --- Rule 1: report markers (checked FIRST -- see module docstring) -----
    title_hits = _match_keywords(haystack, _REPORT_TITLE_PHRASES)
    structure_hits = _match_keywords(haystack, _REPORT_STRUCTURE_PHRASES)
    is_engineer_report_provider = bool(provider_cfg and provider_cfg.get("engineer_report"))
    # 1a. A title phrase is specific enough to stand alone, regardless of
    #     whether a provider was recognised.
    # 1b. Structure wording alone is NOT enough -- it must be corroborated by
    #     a detected engineer_report provider (CNX / EVA). An engineer_report
    #     provider match with NEITHER a title NOR structure hit does NOT
    #     promote here (that covering-letter-shaped case falls through to
    #     Rule 2 as an ordinary instruction -- a provider match alone is not
    #     evidence that THIS particular document is the report itself).
    if title_hits or (is_engineer_report_provider and structure_hits):
        markers.extend(f"report_title:{phrase}" for phrase in title_hits)
        markers.extend(f"report_structure:{phrase}" for phrase in structure_hits)
        if is_engineer_report_provider and provider_name:
            markers.append(f"engineer_report_provider:{provider_name}")
        return {"doc_type": DOC_TYPE_REPORT, "provider_name": provider_name, "markers": markers}

    # --- Rule 2: instruction markers -----------------------------------------
    # Either signal alone is enough: a recognised provider's own detect_phrase
    # IS the corroboration (mirrors email_classifier Rule 1's "a known
    # provider domain -- the match IS the corroboration"); strong instruction
    # wording stands on its own too (mirrors that engine's typed-in-body
    # instruction rule). Reuses _WORK_KEYWORDS verbatim -- not duplicated.
    work_hits = _match_keywords(haystack, _WORK_KEYWORDS)
    if provider_name or work_hits:
        if provider_name:
            markers.append(f"provider_detect_phrase:{provider_name}")
        markers.extend(f"work_keyword:{phrase}" for phrase in work_hits)
        return {"doc_type": DOC_TYPE_INSTRUCTION, "provider_name": provider_name, "markers": markers}

    # --- Rule 3: junk / marketing markers ------------------------------------
    junk_hits = _match_keywords(haystack, _JUNK_PHRASES)
    if junk_hits:
        markers.extend(f"junk_marker:{phrase}" for phrase in junk_hits)
        return {"doc_type": DOC_TYPE_JUNK, "provider_name": None, "markers": markers}

    # --- Rule 4: abstain -- nothing recognisable -----------------------------
    return {"doc_type": DOC_TYPE_UNKNOWN, "provider_name": None, "markers": []}


def _providers_from_catalog(catalog: Any) -> list[dict[str, Any]]:
    """Accept either a full ``load_provider_catalog()`` dict or a bare providers list."""
    if isinstance(catalog, dict):
        return list(catalog.get("providers", []) or [])
    return list(catalog or [])


def _pseudo_document(text: str) -> DocumentModel:
    """A throwaway DocumentModel wrapping ``text``.

    ``ProviderDetector.detect`` only ever reads ``document.plain_text``, so no
    real source file, pages, or metadata are needed -- this stays pure/no-I/O.
    """
    return DocumentModel(
        source_path=Path("attachment_typing_scratch"),
        source_type="txt",
        pages=(),
        plain_text=text,
    )
