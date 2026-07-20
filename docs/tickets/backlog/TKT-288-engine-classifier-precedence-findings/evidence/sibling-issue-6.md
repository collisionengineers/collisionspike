# Ported from cedocumentmapper_v2.0#6

Full original content of `collisionengineers/cedocumentmapper_v2.0` issue #6, "Codex P2 review
findings from PR #4 (intake classifier) — tracking, none pytest-blocking", preserved verbatim before
that repository was archived as part of TKT-287. File paths below were relative to the sibling repo's
`src/cedocumentmapper_v2/`; in this repository they now live under
`services/engine/cedocumentmapper_v2/src/cedocumentmapper_v2/`.

---

## Context

PR #4 (`feat/intake-classifier-2026-06-29`, merged 8445028) and PR #5 (closed as a strict subset of
#4) collected **18 inline Codex P2 review comments** — none blocking, none acted on during the
rules-engine-v2 Phase-0 fork-consolidation merge, per that plan's explicit scope: fix only what
blocks `pytest` green; document the rest for a follow-up pass. This issue is that tracking note.

Two are already resolved as part of the Phase-0 consolidation itself (see below); the other 16 are
open and unactioned — mostly in `rules/email_classifier.py`'s triage precedence.

## Already resolved

- **`application/service.py:61` — "Read the configured app-data catalog".** Fixed on
  `feat/intake-classifier-2026-06-29` before merge (`fix(service): decouple always-reload-seed from
  CLI --app-data-dir semantics`, commit `26b9192`) by adding an explicit `always_reload_seed`
  parameter, independent of "was `app_data_dir` passed", so the parser Function's anti-stale-cache
  need and the CLI's respect-the-on-disk-catalog need no longer collide on one flag.
- **`providers.json:1372` — "Try QDOS triage labels before damage labels".** Confirmed live: QDOS's
  migrated `label_pairs` try `"Damage Area" -> "TP Vehicle"` before `"Accident Circumstances" ->
  "Damage Description"`, so a letter with both blocks extracts the wrong one. **Deliberately NOT
  fixed** in Phase 0 (documented, not patched) — it's a single-line reorder but changes engine-core
  extraction behaviour for every QDOS document, and Phase 0's mandate was fork consolidation, not
  engine tuning. Low-risk, isolated fix for whoever picks this up: swap the two entries in the
  `label_pairs` array in `providers.json` (QDOS provider, `accident_circumstances` field rule).

## Open — `rules/email_classifier.py` (14)

Almost all of these are triage-precedence/ordering issues: a narrower rule (billing, summary/digest
suppression, bounce/auto-reply guard, receipt confirmation, ambiguous-provider) runs *before* a
broader one that should have won, or a scope (sender-written vs. full haystack, reply vs. forward) is
applied too broadly or too narrowly. None change the deterministic engine's pure-function nature; all
are precedence/regex-scope tweaks.

1. `email_classifier.py:176` — Capture common "Ref No"/"Ref Number"/"Claim Number" job references
   (matcher currently requires the token immediately after the label with no linking word).
2. `email_classifier.py:184` — Reject date-shaped structured job refs (e.g. `2026/07/01` currently
   parses as a `body_jobref`).
3. `email_classifier.py:297` — Require precise VRM context words (broad substring matches like
   "vehicle" near "model X5" or "reg" matching "regarding" defeat the abstain-until-identified guard).
4. `email_classifier.py:451` — Honor `A.`-prefixed audit references (`body_caseref` alone doesn't set
   `is_audit` without a phrase match too).
5. `email_classifier.py:517` — Don't suppress provider instructions on receipt-confirmation cover
   notes ("Please confirm receipt" + instruction doc currently falls to `query_existing_work`).
6. `email_classifier.py:597` — Preserve forwarded instruction bodies (a non-reply `FW:` strips the
   forwarded block before work-keyword matching, even though `_is_reply` correctly treats it as not a
   reply).
7. `email_classifier.py:607` — Scope auto-reply markers to sender-written text (a quoted "please do
   not reply" footer in a normal reply currently full-haystack-matches and suppresses to `other`).
8. `email_classifier.py:631` — Ignore irrelevant attachments for body instructions (`not has_atts`
   guard blocks a clear body-only instruction whenever ANY unrelated attachment, e.g. a spreadsheet,
   is present).
9. `email_classifier.py:650` — Don't classify new-work replies as existing queries (a reply with
   `new_work_phrases` but only one keyword and no attachment misses Rule 3 and falls to
   `query_existing_work` on `is_reply` alone).
10. `email_classifier.py:729` — Keep bounce mails out of doc promotion (a genuine bounce/OOO with the
    original instruction doc attached currently skips the auto-reply guard and promotes to
    `receiving_work`).
11. `email_classifier.py:743` — Scope summary/digest suppression to the sender-written body, not the
    full haystack (a reply in a `Summary of cases`-subject thread with an actionable sender body is
    dropped as `non_actionable/case_summary`).
12. `email_classifier.py:772` — Suppress billing requests before doc promotion (a billing-only mail
    with any instruction-typed attachment currently promotes to `existing_provider_instruction` before
    the billing rule runs).
13. `email_classifier.py:789` — Don't route ambiguous providers as new clients
    (`provider_match_state == "ambiguous"` is currently treated like `"none"`, skipping
    disambiguation).
14. `rules/engine.py:179` — Avoid treating report-chase wording as work language (bare "report"
    phrases in a chaser like "Any update on engineer's report CCPY26050" populate `work_phrases` when
    a doc is reattached, bypassing query-suppression).

## Open — readers (2)

15. `readers/pdf.py:380` — Preserve selectable text when forced OCR is partial (`force_ocr=True` on a
    multi-page text PDF can have the OCR salvage path replace a complete PyMuPDF extraction with only
    the OCR'd prefix on timeout, instead of keeping the better selectable-text result).
16. `readers/doc.py:303` — Preserve standalone DOC field values (single-token 4-8 char alphanumeric
    lines — VRMs, case refs, makes — are treated as binary noise and silently dropped from legacy
    `.DOC` binary-scrape output instead of being available to the label-next-line rules). **Worth
    checking first** if picking this up: it may be the root cause (or a contributing cause) of
    `services/functions/parser/tests/test_multiformat_extraction.py`'s `ALS_doc`/eml-nested-instruction
    cases, which return VRM `"VEHICLEMAKE"` instead of `"NG63GHU"` for `ALS INSTRUCT 01.DOC` — those
    specific tests are currently skipped in this repository because their fixture ("ALS INSTRUCT
    01.DOC", a dev-box-only real case document) isn't present in this checkout, so the claim is
    unverified here, not confirmed fixed or still-broken.

## Not filed as a numbered item, but related

The `readers/pdf.py:380` OCR-salvage concern (#15) and the regression test
`test_pdf_ocr_timeout_salvages_pages_done_before_the_cap` cover overlapping ground — worth reading
both together before touching `readers/pdf.py` again.

---

_Originally filed as part of the rules-engine-v2 Phase-0 "consolidate the fork" slice (2026-07-02) in
`collisionengineers/cedocumentmapper_v2.0`. Source: `gh api repos/collisionengineers/cedocumentmapper_v2.0/pulls/4/comments`._
