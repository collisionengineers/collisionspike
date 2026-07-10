# Verification — TKT-028: work_provider not populating on intake
## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

- **Acceptance 1 (QDOS example populates on intake):** the recorded 2026-06-30 e2e (QDOS26001 via
  domain match) + live today at class level: providerMatch outcome=matched for qdosassist.co.uk =
  79 events in 26h (largest sender class); the W3 data-pass corroborates — 20/20 strict-window cases
  today carry resolved principal codes.
- **Acceptance 2 (detected providers written, not dropped — quantified):** providerMatch 26h:
  **182 matched / 25 unmatched / 7 intermediary (85%)**; caseResolve creates since the 2026-07-02
  deploy: **348 = 313 review_auto + 35 manual** — mode is read from the matched work_provider row
  persisted in the same transaction (internal.ts:930-938), so **≥89.9% of ALL created cases provably
  had work_provider_id written at create** (true rate higher; the manual remainder = unmatched
  senders, the designed new-client Held behaviour). Zero resolve-path exceptions in 26h.
- **Acceptance 3 (intermediary non-match preserved, TKT-021):** connexus.co.uk → outcome
  intermediary **7/7** in 26h (never direct matched); matchState stays 'unmatched' by design. No
  regression.
- **Expected absences:** the content-string second signal has had almost no live surface to act on
  (0 detected-but-unwritten cases observed) — additive corroboration per changes.md, not an
  acceptance line; Q2b provenance labels prove/disprove firings at the next data pass.
- **Corpus-coverage note (not this ticket's bug):** qdoslaw.co.uk (1 unmatched in 26h) is a
  QDOS-adjacent domain absent from the corpus — feeds the gated.md D3 domain list.

Queued SQL Q1–Q6 (sharpen, not decide): per-day population rate; per-provider resolved counts;
second-signal provenance labels; the KV64EHB row; the detected-then-dropped probe (expect 0);
Connexus emails; corroboration audits.

## How to re-verify
The two KQL queries in the verdict (providerMatch outcomes by domain; caseResolve creates by mode/day)
— retention is short, run soon; then Q1–Q6.

## Prior verdict (2026-06-30 / 07-02)
CONFIRMED-LIVE for the domain-match path; content-string mapping deployed 2026-07-02 —
superseded by the full certification above.
## Evidence
- Repro material in evidence/ (operator-note.md naming KV64EHB / QDOS26001 / QDOS).
- The 2026-06-30 live e2e showed QDOS26001 populating `work_provider_id` correctly via sender-domain
  match — the operator's exact example was not reproducible as a bug.
- `3a772d1` (2026-07-02) deploys a **second** identification signal: the parser's doc-content-detected
  provider string now maps to a real `work_provider_id` at `caseResolve` (fill-if-empty + provenance),
  for cases the domain match alone would miss. Its commit message records this ticket's path as already
  working via domain match — the new code is additive corroboration, not a bug fix.
## Pending / gaps
- No live probe yet of the new content-string mapping signal specifically (as opposed to the pre-existing
  domain-match path, which is confirmed). A case where sender domain is ambiguous/unknown but the document
  content names a known provider would exercise it.
- Note (per memory): classification/VRM/Case-PO are computed once at intake and fixes are not
  retroactive — re-intake to validate, don't inspect old rows.
## How to re-verify
Re-intake the operator's example (KV64EHB / QDOS26001 / QDOS) and confirm `work_provider_id` still
populates (regression check on the confirmed domain-match path); then find or construct a case where the
document names a provider but the sender domain doesn't resolve one, and confirm the content-string
signal now fills `work_provider_id` for it too, while an intermediary (Connexus, TKT-021) still correctly
does not match.
