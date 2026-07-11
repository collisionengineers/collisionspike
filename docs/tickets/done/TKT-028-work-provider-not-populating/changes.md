# Changes — TKT-028: work_provider not populating on intake
## Status
now — the operator's specific example already worked via domain match (confirmed 2026-06-30); a second,
content-string identification signal deployed live 2026-07-02 (rules-engine-v2 Phase 3) for cases the
domain match alone would miss; awaiting live proof on such a case.
## Commits
- `3a772d1` — feat(identification): Image-Source intermediary resolution + parser-string →
  work_provider_id mapping (ADR-0011). Commit message records the verification-first finding for this
  exact ticket: "TKT-028's QDOS path already worked via domain match" — i.e. the operator's KV64EHB /
  QDOS26001 / QDOS example was not actually broken. The new code adds a **second** signal (the parser's
  doc-content-detected provider string now maps to a real `work_provider_id` at `caseResolve`,
  fill-if-empty + provenance) for cases where sender-domain matching alone is insufficient.
## Summary
Captures the operator's report that work_provider isn't populating despite provider
detection (example KV64EHB / QDOS26001 / QDOS). CONFIRMED: this was already working via the
parser/provider-match (domain) path — the 2026-06-30 live e2e showed QDOS26001
populating work_provider_id correctly (and a Connexus sender correctly not matching,
which is TKT-021). The 2026-07-02 identification work adds content-string→work_provider_id mapping as a
second, complementary signal (not a fix to a reproduced bug). Related to TKT-001 (provider matching) and
TKT-021 (intermediary resolution).
