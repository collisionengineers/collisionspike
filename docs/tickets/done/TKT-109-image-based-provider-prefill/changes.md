# Changes — TKT-109: Pre-fill image-based inspections for image-led providers

## Status
built + deployed (2026-07-08, branch `feat/readiness-ai-spine`) — awaiting verifier

## What changed (the mechanism — applied by TKT-129 as one coherent change)

**Provider-policy signal** — already existed end-to-end: `work_provider.inspection_location_policy_code`
(`always_image_based` = 100000000), joined onto every case read via `CASE_SELECT`
(`Case.providerInspectionPolicy`, TKT-079). Live discovery: **172 providers** (including QDOS/PCH/AX/
SBL) already carry the policy from the corpus seed — no new designation was needed (counts in
[TKT-129 changes.md](../../now/TKT-129-image-based-inspection-done/changes.md)).

**The pre-fill seam** — new `api/src/lib/inspection-prefill.ts`:
- `isPrefillApplicable(case)` (pure, exported, unit-tested): `always_image_based` provider AND empty
  `inspectionAddress` AND `inspectionDecision === 'unknown'` AND non-terminal status. Providers
  without the policy keep the manual flow — the function is false for `prefer_address` /
  `required_address` / unknown providers.
- `prefillImageBasedInspection(caseId, actor?)`: one guarded UPDATE
  (`WHERE … eva_inspection_address = '' AND decision IS NULL/unknown`) that sets the
  `'Image Based Assessment'` literal + `inspection_decision_code = image_based`. Concurrency-safe:
  a just-made staff pick wins the race (the UPDATE matches nothing → no-op, nothing supplementary
  written).
- **Auditable**: one `inspection_override` audit row per fill with
  `reason: "Provider policy: image-based assessment"` + `source: provider_policy` (+ the acting
  staff identity when a staff action triggered the evaluation), and one `field_level_provenance`
  row (`corpus` source, `reviewed` state, label "Provider policy (image-based)") — insert-if-absent.
- **Staff-changeable**: fill-if-empty only; the address picker / manual edit overwrite the value and
  record a manual decision, after which the prefill can never re-fire (decision ≠ unknown).

**Call sites (every status-evaluation seam, so new + existing cases converge):**
- `api/src/functions/cases.ts` `recomputeStatus` (staff-driven edits, merges) — prefill runs before
  the `statusForReviewCase` evaluation and patches the in-memory copy so the same pass sees the
  completed field.
- `api/src/functions/internal.ts` `recomputeStatus` (orchestration `statusEvaluate` activity, the
  internal `status-evaluate` route, enrichment writes) — same seam.
- `api/src/functions/cases.ts` `createCase` — a manual case for an image-led provider pre-fills
  immediately (post-insert `recomputeStatus`).

## Acceptance mapping
- "Image-led providers pre-fill Image Based Assessment on applicable new cases" — the createCase +
  intake `statusEvaluate` seams; existing cases were converged by the TKT-129 delta (224 filled).
- "The pre-fill is auditable and can be changed by staff" — the `inspection_override` audit +
  provenance rows; fill-if-empty + picker override.
- "Providers without the policy keep the current manual choice flow" — `isPrefillApplicable` is
  policy-gated; unit-tested false for the other two policies and for unknown providers.

## Tests
- `api/src/lib/inspection-prefill.test.ts` (new): 7 tests — the applicability matrix, the guarded
  fill + provenance + audited reason, provenance dedup, and the race-lost no-op.

## Live proof / deploy state
Shared with TKT-129 — see its changes.md (deployed to `cespk-api-dev`, 86 fns; live proof on
A.QDOS26029; delta `2026-07-08-image-based-provider-prefill.sql` applied).
