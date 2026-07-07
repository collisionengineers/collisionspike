# Verification — TKT-081: acknowledgement emails misclassified (blank case)

## Verdict
CLASSIFIER FIX LIVE + PROVEN (2026-07-07); mint guard deployed. The blank-case DATA FIX is
the one remaining item (§4) — deferred with a ready-to-run remediation.

## 1. Offline eval (all four samples pass)
The real classifier run on the four sample `.eml`s (provider_match_state none/one) reclassifies:
- sample-1 (greeting + "thank you for this") → `non_actionable/acknowledgement`
- sample-2 (automated "Thank you for your email") → `non_actionable/acknowledgement` (no case)
- sample-3 ("reacted to your message") → `non_actionable/acknowledgement`
- sample-4 ("Hi Ed, thank you, we will see…") → `non_actionable/acknowledgement`

Pins added to the committed eval corpus (`scripts/eval-email/manifest.json`, baseline-v2
regenerated, `--check` clean) + enforced synthetic unit tests in
`functions/parser/tests/test_email_classifier.py`. **181 classifier pytest green, full prior
corpus green (no recall regression).**

## 2. Gate + deploy
Parser deployed live 2026-07-07 (`cespike-parser-dev-x7xt3d5ovhi7y`); orch (mint guard)
deployed (67 fns). No new DDL (the taxonomy it emits was already live).

## 3. Live probe (PROVEN)
`POST /api/classify-email` on the live parser, sample-1 shape
(subject "RE: Mr A Client - AB12 CDE", body "Good morning,\n\nThank you for this!", a reply
header) → **`non_actionable/acknowledgement`** (was `query`). No case-creation path is reached
for a non_actionable email (`categoryMintsCase` guard + the retro `RETRO_TRIGGER_CATEGORIES`
exclusion, both unit-tested).

## 4. Data-fix proof — PENDING (deferred; exact remediation)
The blank case sample-2 opened once (before the fix) is a single inert live row; the ONGOING
cause is fixed (no new ack-cases). Find it read-only, then void per the TKT-010 soft-remove
pattern (Entra `digital@` + `SET ROLE csadmin`, transient FW rule, backup-first, audited):
```sql
-- find
SELECT ie.id, ie.subject, ie.received_on, ie.case_id, c.case_po, c.status_code, c.created_at
  FROM inbound_email ie LEFT JOIN case_ c ON c.id = ie.case_id
 WHERE (ie.sender_address ILIKE '%intactinsurance%' OR ie.subject ILIKE 'Thank you for your email%')
 ORDER BY ie.received_on DESC;
-- void the blank case (soft-remove; audit) once the id above is confirmed as the zero-detail case.
```

## 5. Recall guard
A genuine query and a genuine instruction still classify correctly (full eval corpus green;
`test_expanded_query_phrases_do_not_steal_genuine_work`, `test_reply_reattaching_prior_report_is_query_not_work`
etc. all pass).

## How to re-verify
`functions/parser/.venv/Scripts/python -m pytest functions/parser/tests/test_email_classifier.py -q`
+ the live `POST /api/classify-email` probe above.
