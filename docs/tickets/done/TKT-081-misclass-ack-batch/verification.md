# Verification — TKT-081: acknowledgement emails misclassified (blank case)

## Verdict
CLASSIFIER FIX LIVE + PROVEN (2026-07-07); mint guard deployed; the blank-case DATA FIX is
**DONE 2026-07-07** (§4). Only a redundant full-intake live-occurrence probe remains — the
classify layer is already live-proven and the one bad row is voided.

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

## 4. Data-fix — DONE 2026-07-07
The single pre-fix blank case was located and voided (soft-remove, TKT-010 pattern),
backup-first, audited, via Entra `digital@` → `SET ROLE csadmin` (transient FW rule
added+removed):
- **Located:** inbound_email `d21615d0` ("Thank you for your email", from
  `theresa.ogden@intactinsurance.co.uk`, received 2026-07-06 08:32) had minted case
  `160262e5` — zero details (no VRM / Case-PO / provider / EVA fields; status Error; on_hold).
  Confirmed the ONLY email on the case + its sender = the sample-2 sender.
- **Voided (one transaction):** backup tables `tkt081_backup_case/email/evidence/note` created
  first; then case → status **Removed (100000011)**, name `[removed]`, on_hold cleared,
  `closed_at` stamped; the 4 evidence rows (2 signature images + the ack `.eml`/body) and the
  inbound_email anonymised; a `case_removed` (100000030, Warning) `audit_event` row written.
- **Post-check:** 0 active blank "thank you" cases remain. Rollback available from the backup
  tables. (The classifier fix means no NEW ack now mints a case.)

## 5. Recall guard
A genuine query and a genuine instruction still classify correctly (full eval corpus green;
`test_expanded_query_phrases_do_not_steal_genuine_work`, `test_reply_reattaching_prior_report_is_query_not_work`
etc. all pass).

## How to re-verify
`functions/parser/.venv/Scripts/python -m pytest functions/parser/tests/test_email_classifier.py -q`
+ the live `POST /api/classify-email` probe above.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING (update). Ack re-probe still classifies non_actionable/acknowledgement live (200); eval pins 5/5; App Insights shows classify_email 8/8 -> 200 since 2026-07-06 and zero case-minting internal-route calls in the window. The two Postgres confirmations (voided case 160262e5 still Removed; zero new active blank cases since 2026-07-07) were firewall-blocked on the read-only dispatch — queued for the orchestrator transient-firewall data pass.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.

## Verdict update — 2026-07-09 (orchestrator transient-firewall data pass)

VERIFIED-LIVE — both queued confirmations PASS. (a) Case 160262e5 remains voided: status_code 100000011 (Removed), name [removed], closed_at 2026-07-07 10:58:53Z. (b) ZERO cases minted by non_actionable emails since 2026-07-07: a first-cut linked-email join surfaced 9 rows, but drill-down proved every one is an ack LINKED to a case that was minted by a category-100000000 receiving_work email seconds before case creation (e.g. 4f2201fa: Connexus "569617 / Our ref: KC06NOV" receiving_work 14:20:23Z -> case 14:20:37Z; the RE: ack 14:36:56Z linked after) — exactly the designed attach behaviour, not a mint. Combined with the 2026-07-09 live classify re-probe (non_actionable/acknowledgement) and green pins, all acceptance evidence is now in place.

Verified by: orchestrating session (direct Postgres reads, Entra digital@ -> SET ROLE csadmin; transient rule csdatapass added then removed; the ~17 stale cs*/tmp transient rules from prior sessions were ALSO deleted — only AllowAzureServices remains).
