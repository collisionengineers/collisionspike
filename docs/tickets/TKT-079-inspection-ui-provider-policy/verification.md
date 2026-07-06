# Verification — TKT-079: Address picker polish — provider default chip, distance hints, show-more

## Verdict
DEPLOYED (2026-07-06). Live click-through screenshots per policy class are the operator's (the SPA is
staff-MSAL only). Build + tests green; the SPA is live on `cespk-spa-dev` (CSP header re-verified).

## What shipped
- **Provider default (informational, never auto-applied — ADR-0013/0016):** the provider's
  `inspectionLocationPolicy` is now joined onto the Case (`CASE_SELECT` + domain `Case.providerInspectionPolicy`
  + the case mapper). CaseDetail shows a plain note *"This provider is usually recorded as Image Based
  Assessment — use the override below if the vehicle can't be inspected in person"* only when the provider is
  operator-designated `always_image_based`. It does NOT auto-apply; the reviewer still records IBA via the
  override checkbox + a required reason (the DB CHECK + code path are untouched).
- **Distance hint:** each suggestion row shows a muted "~N miles away" from the case postcode when
  `distanceMiles` is present (ordering/presentation only).
- **Provider chip:** already present ("Provider XXX"), now correct post-reseed.
- **Show-more:** the corpus shortlist is capped to 4 rows with a "Show N more"/"Show fewer" toggle (assist
  candidates always shown in full; hidden while searching the full corpus).

## Tests / build
- domain 886 / api 183 / mockup-app 275 all pass; SPA `tsc -b` + vite build clean.
- The IBA-requires-a-reason invariant is unchanged (the override flow + `ck_inspection_address_image_based_reason`
  CHECK still enforce it) — the chip is informational only.

## Pending (operator)
Live click-through: a case whose provider is `always_image_based` (once the operator designates one from the
TKT-075 run report) to see the note; a normal provider to see distance hints + show-more; confirm an IBA save
without a reason is still rejected. No provider is designated `always_image_based` yet, so the note is
forward-looking today. Full narrative: `LIVE_FACTS.json` `verifiedBy`.
