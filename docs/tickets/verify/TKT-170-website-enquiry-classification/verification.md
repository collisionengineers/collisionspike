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
- Apply the additive taxonomy delta before deploying parser/services/orchestration/API/SPA.
- Reprocess or safely probe the supplied message read-only and show the corrected label
  with no case mutation and no Outlook move.

## Independent verification update — 2026-07-14

### Verdict

PENDING — source, fixture, focused-test and deployed-SPA evidence is strong, with no live
contradiction. Acceptance requires the supplied message or an equivalent safe probe to return
`website_enquiry / website_general_enquiry` from the live parser without changing Outlook. Existing
telemetry records successful invocations but not inputs or returned category/subtype. Live lookup rows
and exact deployed backend revision also remain unproved. This is unavailable evidence, not evidence
of wrong behavior.

### Evidence

- Acceptance 1 — **TESTED (offline).** Operator evidence and corpus copy are byte-identical, SHA-256
  `05CE90469B8AE0B8207D04640B2920DD2BF96B33E025444509B3DBA8A8C8BA36`. The message contains aligned
  DMARC/compauth, exact mailbox, subject, heading and footer. Corpus expects
  `website_enquiry / website_general_enquiry`; parser decision tree gives the website rung precedence
  before case rules. Fresh verifier runs: website slice 5 passed/186 deselected; exact corpus 1
  passed/35 deselected.
- Acceptance 2 — **TESTED (offline).** Exact sender/domain, anchored form markers and aligned
  authentication are all required. RFC mailbox parsing/domain consistency and fail-closed recipient
  authentication are implemented. Negative tests cover external sender, one marker, display-name
  lookalikes, exact address only in display name, and failed/missing/partial/unbound authentication.
- Acceptance 3 — **TESTED (offline).** The website rung ignores an open case, attachments,
  `QDOS26079` and `AB12CDE`, returns `proceed_default`, and has no target case. Only
  `receiving_work` can mint; API retro and reply-linking guards reject website enquiries. Fresh domain
  policy/folder/routing/codec slice: 4 files/78 tests passed.
- Acceptance 4 — **TESTED (source), partially live.** Merge `eaa31fbe` spans parser/domain/additive
  DDL/API/services/orchestration/SPA. Baseline and idempotent delta append the codes; DTOs, mappings, counts,
  assisted vocabulary and SPA taxonomy all contain them. PR 80 and sibling PR 10 are merged; remote
  tag `engine-v2.24` resolves to reviewed commit `e9cec4acb8f1f49fb81c4d279d3a31cc82356d84`, matching
  `VENDOR_LOCK.json`. Live database rows and backend revisions remain unproved.
- Acceptance 5 — **VERIFIED-LIVE for deployed asset.** Source labels are `Website enquiries` and
  `Website enquiry`. Production `/assets/index-CbUqeEAY.js` returned 200 and contains both labels and
  taxonomy keys (`Last-Modified: Mon, 13 Jul 2026 12:48:32 GMT`; SHA-256
  `CEAE61DFE54EC9072E0AE6A154C0066A05FD495FEDA48D8B0560E54B1F8E4A0F`).
- Acceptance 6 — **TESTED (offline), present in live asset.** Pure folder mapping is
  `Inbox/Queries/Enquiries`; the live bundle contains it. No Graph/mailbox call or move occurred.
- Acceptance 7 — **TESTED (offline).** Corpus registration, exact `.eml`, negative near-matches and
  reference/registration/attachment/open-case collision fixture are present; exact corpus passed.
- Acceptance 8 — **TESTED (offline), partially independently reproduced.** Ticket records parser 183
  passed/9 environmental skips, domain 1,140, API 633, orchestration 418, SPA 469 and builds. This
  verifier reproduced parser website/exact corpus and domain 78-test slices; contracts were inspected
  and the live bundle proves shipped UI constants.
- Acceptance 9 — **PENDING.** Parser Function is Running. Activity logs show publishing-credential
  access at `2026-07-13T06:12:36Z` and restart at `06:16:19Z` after PR merge. App Insights shows
  successful `Functions.classify_email` calls after merge through 2026-07-14. Searches for the
  taxonomy values, subject and message-id returned no rows because function logs omit response bodies.
  None proves the required result or mailbox invariance.

### Pending / gaps

- No captured live parser response ties the supplied message/hash to `website_enquiry`,
  `website_general_enquiry`, `taxonomy_version=4`.
- The live registry still identifies parser `engine-v2.10`/taxonomy-v3; TKT-170 requires
  `engine-v2.24`/taxonomy-v4. Later activity suggests a deploy but does not fingerprint it.
- Live PostgreSQL lookup parity is unproved. An authorized read without firewall change failed to
  connect; no firewall rule or retry loop was used.
- No authenticated inbox row was read; live asset proves strings/mapping only.
- API/services/orchestration/SPA focused reruns were unavailable without local dependencies; no install was
  made.

### How to re-verify

1. From an approved read-only Azure path, identify deployed parser artifact/version and prove
   `engine-v2.24` at `e9cec4ac...`; update the live registry.
2. With explicit approval for a no-side-effect classifier probe, parse the byte-identical `.eml` and
   POST only classifier fields to live `/api/classify-email`; do not invoke services/orchestration/reprocessing.
   Capture 200 with category, subtype, taxonomy version 4 and website-rule signals.
3. Read the original Graph message before/after and compare immutable message ID and folder; do not
   move it. Read inbound/case records for that internet-message-id and prove no mint/link/update.
4. From an already-authorized database network path, read lookup codes `100000008` and `100000015`.
   Confirm API/orchestration provenance and rerun focused suites with dependencies present.

### Confidence + unread surfaces

High confidence in source, fixture/corpus, anti-spoof rule, no-mint/link policy and deployed SPA
taxonomy; medium confidence a post-merge parser deploy occurred; low confidence in exact live
classification because telemetry omits the result. Unread surfaces are deployed parser
files/version, live lookup rows, response body, authenticated inbox row, original message folder
before/after, and live case-link state. Verification performed only read-only Azure metadata/log
queries and HTTP GETs; no mailbox, Archive, database, firewall, setting, deployment or ticket state
was changed.

