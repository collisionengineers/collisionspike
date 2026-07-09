# Changes — TKT-097: Cancellation email misclassified as a case query

## Status
not started

## PLAN-003 classifier wave — 2026-07-09

**Root cause (confirmed by direct run):** the Oakwood reply ("The client does not wish to proceed
with the engineers report") matched NO `cancellation_phrases` entry — the list had "no longer
proceeding" but not the "not wish to proceed" family — so nothing reached the highest-precedence
cancellation rung and the email promoted via `images_with_work_signal` (signature images + the
"engineers report" work keyword) to `receiving_work/new_client_work`. (The ticket's observed
"case query" label was the SPA-side reading; the engine repro shows the promotion.)

**Shipped (sibling-first, engine-v2.10, re-vendored):** `resources/triage-rules.json`
`cancellation_phrases` +2 — `"not wish to proceed"`, `"no longer wishes to proceed"` (29→31; parity
snapshot updated in the same commit). No rule-order change needed — Rule 0c already outranks
`query_existing_work` AND the image/work promotion; the phrase gap was the whole defect. The negation
guard is unaffected (it guards "cancel" stems only; these phrases self-contain their negation).

**Tests/eval:** sibling pins (the Oakwood reply shape → `cancellation/cancellation_notice`; a
"no longer wishes to proceed" body → cancellation). Eval pin `tkt097-oakwood-cancellation` (the REAL
.eml, pms one — Oakwood is the established OAK provider); cancellation subtype accuracy 13/13; full
corpus 87.9%, `--check` clean.

**Deploys/probes:** parser engine-v2.10 live; live `POST /api/classify-email` probe 3 on the
"not wish to proceed" reply shape returned `cancellation/cancellation_notice` (2026-07-09).

**Remainders:** the audited re-route of the ORIGINAL live email (propose close/hold per TKT-041's
staff-confirmed rule) is triage-surface behaviour — the acting TRIAGE_CANCELLATION_ENABLED rung
handles the next arrival; retroactively re-routing the already-triaged row is left to staff.
