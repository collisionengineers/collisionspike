# Verification — TKT-083: instructions email left "Unidentified"

## Verdict
CLASSIFIER FIX LIVE + PROVEN (2026-07-07). A live intake probe (a case opened with the ref +
VRM) + the operator-reviewable domain add remain.

## 1. Offline eval (sample passes)
Real classifier run on the sample `.eml` → **`receiving_work/new_client_work`** (was
`other/other`), with `body_jobref=30230-01` and `body_vrm=BV72YVB` surfaced. Pinned in
`scripts/eval-email/manifest.json` (baseline-v2 regenerated, `--check` clean) + an enforced
unit test (`test_tkt083_body_instruction_one_phrase_with_ref_and_vrm_promotes`, which also
asserts the floor STILL holds without a ref+VRM). Full prior corpus green.

## 2. Gate + deploy
Parser deployed live 2026-07-07 (`cespike-parser-dev-x7xt3d5ovhi7y`).

## 3. Live probe (PROVEN at classify layer)
`POST /api/classify-email` on the live parser, sample shape ("New INSTRUCTIONS:", Our Ref
30230-01, VRM AB72 YVB) → **`receiving_work/new_client_work`**. So a case would now be opened
(new-client → Held, since the provider isn't yet in the domain corpus — see changes.md).

## 4. Recall guard
A genuinely unidentifiable email still abstains: `test_body_only_instruction_needs_two_phrases_and_a_reference`
(single phrase, no ref/VRM → `other`) still passes; the new arm requires BOTH a ref and a VRM
and no query phrase, so it cannot starve the abstain lane. Full corpus green.

## Pending
- A live intake probe (a real fairwaylegal instruction email opens a case carrying ref
  30230-01 + VRM). Operator-reviewable: add `fairwaylegal.co.uk` to `known_email_domains`
  (would upgrade to `existing_provider_instruction`).

## How to re-verify
Classifier pytest + the live `POST /api/classify-email` probe above.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

FAILED on Acceptance line 2 as written; lines 1 and 3 live-proven. The deployed Rule-3 second arm (email_classifier.py ~L1225) requires body_vrm AND has_existing_ref; the acceptance says "a ref OR VRM". The narrowing was deliberate and documented in changes.md to protect the abstain lane, but the acceptance-specified behaviour does not hold: a fresh single-phrase instruction with ref-only (or VRM-only) still abstains to other/other. Also: this ticket's changes.md/verification.md claim fairwaylegal.co.uk is NOT in known_email_domains, but the registry records seed 916 Section A applied 2026-07-03 (FW -> fairwaylegal.co.uk) — ticket docs stale; registry wins pending a row-level SELECT. DISPOSITION: reopened verify->now; the ref-OR-VRM widening is folded into the classifier batch (ship if the eval corpus stays green, else amend the acceptance with rationale).

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

### Data-pass addendum — 2026-07-09

Row-level confirmation: work_provider FW carries known_email_domains = fairwaylegal.co.uk (the registry was right; this ticket's changes.md claim was stale). The classifier batch reconciles the docs + adjudicates the ref-OR-VRM widening.
