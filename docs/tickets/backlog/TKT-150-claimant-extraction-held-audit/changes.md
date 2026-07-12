# Changes — TKT-150: Restore claimant-name extraction and remediate affected held cases

## Status
Parser extraction slice implemented and immutably re-vendored. Ticket lifecycle remains unchanged;
the live census, QDOS26079 trace, deployment, remediation, readiness recomputation, and independent
verification remain dispatcher-owned follow-up work.

## Commits

- Sibling `cedocumentmapper_v2.0` `f3e780f` / `engine-v2.17` — ordinary claimant prose,
  explicit-label precedence, and e-mail-signature exclusion.
- Sibling `c99ca5b` / `engine-v2.18` — preserve claimant evidence across reply/forward boundaries
  while excluding the current sender's signature.
- Sibling `f0026d2` / `engine-v2.19` — reduce labelled values to a conservative person-name prefix.
- Sibling `3809941` / `engine-v2.20` and `8bf8311` / `engine-v2.21` — immediate-only empty-label
  continuation, safe explicit surnames, organisation rejection, and domain-qualified prose anchors.
- Sibling `9998284` / `engine-v2.22` — reject claimant absence markers (`TBC`, `TBA`, `N/A`,
  `None`, `Unknown`, and reviewed long forms); the annotated tag is pushed unchanged.
- CollisionSpike `364cc25`, `311aa1b`, `103a35b`, `9c6e4df`, and `6982347` — pure-mirror cuts
  through `engine-v2.22`, immutable-lock regeneration, and matching wrapper regressions.

## Files touched

- Sibling `src/cedocumentmapper_v2/rules/engine.py`.
- Sibling `tests/test_claimant_name_extraction.py` and seven non-PII EML/golden fixture pairs.
- `functions/parser/cedocumentmapper_v2/rules/engine.py`, `VENDOR_LOCK.json`, and `PROVENANCE.md`.
- Matching Function-wrapper fixtures and `functions/parser/tests/test_claimant_name_extraction.py`.

## Summary

Claimant-name extraction now ranks explicit claimant/client labels above weaker prose, can recover
conservative ordinary wording, and does not take a case handler, e-mail signature, repairer, third
party, insured, organisation, trailing instruction prose, or unrelated later line as the claimant.
Thread boundaries end only the current signature range, so a quoted original instruction remains
available. Provider-specific aliases remain authoritative only for their reviewed layouts.

`engine-v2.22` closes the remaining absence-marker hole. A placeholder is rejected at both the
configured-rule safety boundary and the explicit-label fallback. It therefore remains blank when no
defensible claimant exists and cannot prevent a later defensible prose candidate from being used.
The adversarial EML combines `Claimant Name: TBC` with a second claimant label inside the handler's
signature, proving that neither supplies an invented claimant.

Proof recorded during implementation:

- Sibling claimant suite: **72 passed**.
- Sibling split full suite: **522 passed / 5 skipped / 5 failures identical to the clean
  `engine-v2.21` Windows legacy-DOC/eval baseline**.
- Immutable vendor verifier: **PASS, 36 files, official `engine-v2.22` tag verified**.
- CollisionSpike focused parser slice: **292 passed / 11 environment skips**.
- CollisionSpike full parser suite: **367 passed / 11 skipped / 1 unchanged ALS legacy-DOC
  baseline failure**.

Payment/remittance classification was deliberately not changed here: it is owned and pinned by
TKT-105 and TKT-120, outside TKT-150's claimant-extraction acceptance.
