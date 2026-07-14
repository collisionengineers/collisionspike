# Verification — TKT-170: Classify website contact forms as Website enquiries

## Verdict
TESTED (offline) — implementation is complete on the feature branch. Reviewed sibling
merge/tag, deployment, and read-only live replay/probe remain before `VERIFIED-LIVE`.

## Evidence
- Parser exact corpus + negative-near-match/route/vendor-lock suite: **183 passed, 9 environmental skips**.
- Sibling classifier suite at reviewed PR 10 head: **74 passed**.
- Sibling full suite: **528 passed, 3 skipped, 4 pre-existing ACSP/eval-baseline
  failures** unrelated to the classifier diff.
- Domain suite: **54 files, 1,140 tests passed**; build passed.
- API suite: **65 files, 633 tests passed**; build passed.
- Orchestration suite: **30 files, 418 tests passed**; build passed.
- SPA suite: **42 files, 469 tests passed**; production build passed.
- Exact fixture proves `website_enquiry / website_general_enquiry` wins despite a
  registration-like token, reference-like token, attachment and open-case match.
- Domain policy tests prove no attach/update action, and the Data API guard suite proves
  only `receiving_work` may mint.
- Folder test proves the suggested destination is `Inbox/Queries/Enquiries`; no Outlook
  mutation was performed.

## Release and live evidence
- Immutable source proof is complete: `engine-v2.24` at reviewed sibling commit
  `e9cec4acb8f1f49fb81c4d279d3a31cc82356d84`, **PASS (36 files)**.
- Apply the additive taxonomy delta before deploying parser/orchestration/API/SPA.
- Reprocess or safely probe the supplied message read-only and show the corrected label
  with no case mutation and no Outlook move.

