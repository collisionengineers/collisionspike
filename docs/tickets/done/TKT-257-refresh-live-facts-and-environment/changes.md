# Changes — TKT-257: Refresh LIVE_FACTS and the live-environment doc

## Status

Implemented on branch `plan009/estate-nonmutating`. Registry refresh from a read-only inventory; no live
mutation.

## What changed

- **`LIVE_FACTS.json`:**
  - `environment.subscriptionTier` corrected `Azure Free Trial` → `Pay-As-You-Go` (A1).
  - `deployables.orchestration.functionCount` corrected `101` → `105` (the drifted app-tier count; the
    API figure `144` is confirmed already-correct and unchanged) (A2).
  - `deployables.evaValidation` refreshed: resource presence re-confirmed 2026-07-19 (still deployed);
    `liveRetirement` reworded to record it as operator-gated (TKT-252, not performed — kept as the
    rollback guard); the 90-day telemetry reading kept as `observedRequestsAsOf: 2026-07-15`.
  - `lastVerified` set to `2026-07-19T22:40:05Z`; `verificationMode` records the read-only ARM resource
    inventory that directly confirmed presence, and notes the offer/count corrections are carried forward
    from the banked PLAN-009 read-only dossier (not re-minted from source).
  - `operatorWatchItems`: the "upgrade before the Free Trial expires" item removed (superseded by the
    PAYG correction).
- **`docs/operations/live-environment.md`:** new dated `## Estate re-verification — 2026-07-19` section;
  the current-state "Operating constraints" free-trial line corrected to pay-as-you-go. The dated
  `2026-07-16` deployment-validation reading (which recorded `101` correctly for that date) is left
  intact — not overwritten — per the no-silent-overwrite principle.

## Evidence basis and honesty note

The **resource inventory** (all deployables present, EVA-validation still deployed, estate shape
unchanged) was **directly re-verified** by a fresh 2026-07-19 read-only ARM inventory. The **offer type**
and the **exact orchestration function count** are not cleanly exposed through the available read-only
tooling (Resource Graph returns resources, not subscription offer metadata or function sub-resource
counts); those two corrections are the ticket-mandated values **carried forward from the banked
PLAN-009 dossier** and recorded as such in `verificationMode`, not inferred from source. Sequencing: this
lands last among the implemented (non-mutating) members; tickets 1–3 (252/253/254) are operator-gated
live-writes deferred, so no retirement is recorded as done.
