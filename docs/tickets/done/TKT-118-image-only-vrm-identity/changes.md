# Changes — TKT-118: Rename the "Image Based" case label + identify image-only cases by VRM

## Status
Built + deployed live (2026-07-09, PLAN-003 UI-wave batch). Pairs with TKT-024 (the image-only
new-case form, same batch).

## What was built

**Label rename (no collision with "Image Based Assessment")**:
- `packages/domain/src/model/queues.ts`: `CASE_TYPE_LABELS.images_only` → **"Images received —
  awaiting instructions"**; new `CASE_TYPE_SHORT_LABELS` ("Awaiting instructions") for tight chrome.
- `apps/web/src/features/intake/ManualIntake.tsx`: the entry button renamed **"Images only (no
  instructions yet)"** (was "Image based (images only)"); dropzone copy updated. Grep confirms no
  rendered "Image based" wording remains for the composition sense — every remaining "Image Based
  Assessment" string is the inspection METHOD (correct).

**VRM as the primary identifier (no Case/PO before instructions)**:
- `apps/web/src/features/cases/CaseList.tsx`: the Case/PO cell of a pre-mint case now shows the **VRM in
  mono + a muted "by registration" line** (tooltip: "No Case/PO yet — identified by the registration
  until instructions arrive") instead of a bare em-dash.
- `apps/web/src/features/cases/CaseDetail.tsx`: the header fallback reads **"No Case/PO yet — identified
  by registration"** beside the large VRM plate.
- Search already keys on VRM (global search + queue search hay include `vrm`); `caseDisplayName`
  (row labels) was already VRM-first — verified, not rebuilt.

**No-mint-before-instructions — verified, not rebuilt.** Holds by construction: the API mints a
Case/PO only under a supplied/matched principal (`createCase` auto-mint requires `providerCode`;
`cases/resolve` mints only for a matched provider). The TKT-024 image-only form sends NO provider,
so no number can mint; the normal mint happens when instructions arrive (attach/merge/EVA-add
stamp path, ADR-0022).

## Deploy + live proof
Live E2E: created an image-only case (VRM TE57IMG) via the new form → case page showed the VRM
plate + "No Case/PO yet — identified by registration", no Case/PO minted. Evidence:
`evidence/live-image-only-case-vrm-identity.png`. (The case was then closed via TKT-010's Close
case — it remains inspectable at `/case/f94fee69-117e-4682-8b53-54c6cbf288a7` with all details
kept, demonstrating the non-destructive close.)

## Remainders
- No pre-mint case currently sits in a queue that shows the Case/PO column, so the "by registration"
  CELL render is proven by code + the case-page header live shot; the verifier can re-check the cell
  the next time an image-only case is open in Not ready.
