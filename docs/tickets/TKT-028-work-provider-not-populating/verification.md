# Verification — TKT-028: work_provider not populating on intake
## Verdict
CONFIRMED-LIVE for the domain-match path (2026-06-30); content-string mapping (second signal) CODE
DEPLOYED 2026-07-02, awaiting live proof
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
