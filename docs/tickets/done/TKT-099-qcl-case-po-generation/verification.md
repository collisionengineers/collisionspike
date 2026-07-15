# Verification — TKT-099: QCL cases not generating Case/PO correctly

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

- **Acceptance 1 (QCL intake mints a valid QCL… Case/PO):** six complexreports.com PUSH intakes
  since the 2026-07-09 seed, EVERY one minting — each providerMatch matched(domain
  complexreports.com) is followed within seconds by caseResolve created then boxFolderCreate
  applied:true (six case-id/folder-id triplets listed, 07-09 08:29Z → 07-10 15:15Z). The mint
  inference is STRUCTURAL: intakeOrchestrator.ts:667-688 guards the Box sub-orchestration with
  `if (resolved.casePo)` and names the folder casePo.toUpperCase() — boxFolderCreate cannot fire
  without a minted PO; the mint is formatCasePo('QCL','26',MAX+1) → only QCL26NNN. Case identity
  confirmed via purge blob paths (…QCL_KM60XTA… etc.); QCL26007 corroborated by the W3 data pass.
  The seed delta (idempotent, backup-first) is committed + registry-recorded applied.
- **Acceptance 2 (regression coverage):** provider-match suite pins the multi-domain arm; case-po
  suite pins the mint arm — verifier's own run: **108/108 across 6 files**. (Note transcribed: the
  changes.md claim of a QCL-shaped dedup fixture is inaccurate — dedup fixtures are PCH/QDOS-shaped;
  line 2 is satisfied by the provider-match + case-po suites, the actual allocator path.)
- **Expected absences (by design):** the 11 pre-fix Held QCL cases keep no Case/PO (ticket board D3
  recorded operator decision — staff confirm each, then mint via Set Case/PO); retro-drain creates
  log casePo:null even for matched providers (the ADR-0022 NEVER-MINT contract) — not defects.

Queued SQL (closing formality): the QCL26% sequence (expect ≥7 contiguous); the six traced case ids'
POs; the 11 Held rows' state; the QCL known_email_domains post-check.

## How to re-verify
The KQL triplet query (matched→created→folder-applied, ~24-48h retention); the 108-test run; the
queued SQL at the next data pass.

## Pending / gaps
Implementation not started. A QCL sample would strengthen reproduction.

## How to re-verify
- A QCL intake mints a valid `QCL…` Case/PO (leading-alpha + year + 3-digit number).
- Regression coverage for the QCL allocator path.
