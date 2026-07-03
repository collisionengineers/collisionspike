# Changes — TKT-021: Resolve Connexus claims-manager to the real provider (PCH/SBL)
## Status
now — Image-Source intermediary resolution code deployed live 2026-07-02 (rules-engine-v2 Phase 3);
activates once the D8 seed delta (Connexus → PCH/SBL) is applied — see [verification.md](./verification.md).
## Commits
- `3a772d1` — feat(identification): Image-Source intermediary resolution + parser-string →
  work_provider_id mapping (ADR-0011). `matchSenderIdentity` now resolves address-level provider >
  intermediary > domain-level provider, and provider-match records carry the intermediary `image_source`
  + its N:N provider candidates. The Connexus→{PCH,SBL} seed row itself rides the operator-gated D8 delta
  ([`2026-07-02-rules-engine-v2-identification.sql`](../../../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql)),
  not yet applied live.
## Summary
Captures the operator's ask to treat Connexus as an intermediary and resolve the
underlying principal (PCH or SBL) from the email/attachment. Related to TKT-001
(provider matching at intake) and to TKT-028 (work_provider not populating). The resolution code is
deployed; the Connexus intermediary row + PCH/SBL join is data (D8), not yet live.
