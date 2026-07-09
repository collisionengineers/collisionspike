# Changes — TKT-079: address-picker polish + provider policy

## Status
DONE (built + deployed 2026-07-06) — awaiting the operator live SPA click-through. Full proof in
[verification.md](./verification.md); full cross-cutting narrative in `LIVE_FACTS.json` `verifiedBy`
(2026-07-06 inspection-address repair).

## Summary
Provider `inspectionLocationPolicy` joined onto the Case (`CASE_SELECT` + domain `Case.providerInspectionPolicy` + mapper) → a CaseDetail informational note for `always_image_based` providers (never auto-applied; IBA-needs-a-reason unchanged). Suggestion rows gained a '~N miles away' distance hint (from `distanceMiles`) + a show-more cap (4 visible). Deployed to `cespk-spa-dev`.

## 2026-07-09 — the common-chip half (the verifier's FAILED line; shared fix with TKT-076)

The provider/common chip distinction now exists: scoped rows keep "Provider XXX"; scope-FALLBACK
rows render **"Common location — not specific to this provider"** plus the list-level banner
("Showing common locations — none saved for this provider yet."). See TKT-076's changes entry for
the implementation seam (`CaseDetail.tsx` SuggestedLocationRow + the shortlist header). Deployed
2026-07-09 (SPA).
