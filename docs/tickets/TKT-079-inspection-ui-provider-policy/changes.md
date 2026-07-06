# Changes — TKT-079: address-picker polish + provider policy

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
Provider `inspectionLocationPolicy` joined onto the Case (`CASE_SELECT` + domain `Case.providerInspectionPolicy` + mapper) → a CaseDetail informational note for `always_image_based` providers (never auto-applied; IBA-needs-a-reason unchanged). Suggestion rows gained a '~N miles away' distance hint (from `distanceMiles`) + a show-more cap (4 visible). Deployed to `cespk-spa-dev`.
