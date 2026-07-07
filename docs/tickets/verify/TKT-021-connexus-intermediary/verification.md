# Verification — TKT-021: Resolve Connexus claims-manager to the real provider (PCH/SBL)

## Verdict
CODE DEPLOYED (2026-07-02) — activation pending the D8 seed delta

## Evidence
- `3a772d1` (2026-07-02) deploys `matchSenderIdentity` (address-level provider > intermediary >
  domain-level provider) and extends the provider-match records to carry an intermediary `image_source` +
  its N:N `work_provider` candidates ([`packages/domain/src/domain/sender-identity-match.ts`](../../../../packages/domain/src/domain/sender-identity-match.ts),
  unit-tested). This is live on `cespk-api-dev` / `cespk-orch-dev`.
- The **data** side — a `connexus.co.uk` intermediary `image_source` row joined N:N to PCH + SBL — is
  authored as the operator-gated delta
  [`2026-07-02-rules-engine-v2-identification.sql`](../../../../migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql)
  (gated.md **§D8**) and is **not yet applied** to the live database. Until it lands, the code path is
  live-safe but degrades to today's behaviour (an empty intermediary candidate list) per the delta's own
  "Unblocks (not blocks)" note.

## Pending / gaps
- 🔒 D8 seed apply (operator, [docs/gated.md](../../../gated.md) §D8) — required before a Connexus email can
  resolve to PCH/SBL instead of "new enquiry".
- No live probe yet against a real Connexus email post-seed (can't be exercised until D8 lands).

## How to re-verify
After D8 is applied: re-intake a real Connexus email and confirm it is no longer flagged as a new
enquiry/customer — it resolves to PCH when the email/attachment indicates PCH, to SBL when it indicates
SBL, and holds for review with an explicit unresolved-principal reason when neither can be determined.
