"""Pure CE-report classifier for the box-webhook receiver (TKT-095 detector (b)).

[BUILD] — pure functions, zero I/O, unit-tested offline (tests/test_report_classifier.py).

When a `FILE.UPLOADED` webhook resolves to a case, the receiver asks this module
whether the upload is the CE **engineer report** being delivered back to the work
provider (the ADR-0023 `done` signal) rather than ordinary case evidence.

DISCRIMINATOR CHOICE (the PLAN-case-done-lifecycle Phase C open sub-decision,
resolved here to the plan's own default): an upload classifies as a CE report when

  1. it is a **PDF** — filename extension ``.pdf`` (the Box FILE.UPLOADED payload
     carries no contentType, so the extension is the reliable signal; an optional
     ``content_type`` parameter is honoured when a caller has one), AND
  2. the **filename** contains
       a. the case's **Case/PO** (case-insensitive, space/punctuation-tolerant:
          both sides are stripped to alphanumerics before the containment check,
          so "CCPY 26050 - Report.pdf" matches Case/PO ``CCPY26050``), OR
       b. a whole ``report`` / ``assessment`` token (tokenised on
          non-alphanumerics, so ``CE-Report-v2.pdf`` matches but ``reportage.pdf``
          does not — token matching keeps precision over bare substring search).

The alternatives noted in the plan (a Box metadata flag; a dedicated report
subfolder) remain open for the business-account phase; neither exists in the
tenant today, so the filename heuristic is the honest v1. Misclassification is
LOW-CONSEQUENCE by design: the evidence row lands as kind ``engineer_report``
instead of the derived kind, and the mark-done call is guarded server-side
(`WHERE status_code = eva_submitted`) so a non-submitted case is never moved.
"""

from __future__ import annotations

import re

# Whole-word-ish tokens that mark a CE report/assessment document. Tokenised on
# non-alphanumeric boundaries (underscores/dots/dashes all split), lower-cased.
_REPORT_TOKENS = frozenset({"report", "assessment"})

_TOKEN_SPLIT_RE = re.compile(r"[^a-z0-9]+")
_ALNUM_ONLY_RE = re.compile(r"[^A-Z0-9]+")


def _normalise_alnum(value: str | None) -> str:
    """Upper-case and strip everything but [A-Z0-9] — the space/punct-tolerant
    canonical form both the Case/PO and the filename are compared in."""
    return _ALNUM_ONLY_RE.sub("", (value or "").upper())


def is_pdf(filename: str | None, content_type: str | None = None) -> bool:
    """PDF check: contentType wins when supplied; else the filename extension.
    (The Box webhook payload has no contentType — extension is the live path.)"""
    ct = (content_type or "").strip().lower()
    if ct:
        return ct == "application/pdf" or ct.startswith("application/pdf;")
    return (filename or "").strip().lower().endswith(".pdf")


def filename_mentions_case_po(filename: str | None, case_po: str | None) -> bool:
    """True when the alphanumeric-normalised Case/PO appears inside the
    alphanumeric-normalised filename. Empty/unknown Case/PO never matches."""
    po = _normalise_alnum(case_po)
    if not po:
        return False
    return po in _normalise_alnum(filename)


def filename_has_report_token(filename: str | None) -> bool:
    """True when the filename carries a whole 'report'/'assessment' token
    (tokenised on non-alphanumerics — '_Report-final.pdf' hits, 'reportage' not)."""
    tokens = _TOKEN_SPLIT_RE.split((filename or "").lower())
    return any(t in _REPORT_TOKENS for t in tokens)


def is_ce_report(
    filename: str | None,
    case_po: str | None,
    content_type: str | None = None,
) -> bool:
    """The TKT-095 detector (b) classifier — see the module docstring for the
    discriminator rationale. PDF AND (Case/PO in filename OR report/assessment
    token). Pure; no I/O."""
    if not is_pdf(filename, content_type):
        return False
    return filename_mentions_case_po(filename, case_po) or filename_has_report_token(filename)
