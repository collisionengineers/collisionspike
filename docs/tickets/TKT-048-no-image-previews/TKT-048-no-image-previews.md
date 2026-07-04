---
id: TKT-048
title: Inbox/case image previews not rendering
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-002, TKT-016]
research-link: GO_LIVE_SPRINT_PLAN.md
---

# Inbox/case image previews not rendering

## Problem

Every image tile on a case's **Evidence** tab renders as a blank grey block — the
operator screenshot ([1.png](./1.png)) shows eight
`ClientVehicle…DamageImage*.jpg` cards where the thumbnail area is an empty slate rectangle;
only the filename, the `Role` dropdown (all `Unclassified`), the `Exclude (person reflection)`
toggle, and the `Open in Archive ↗` deep link render. No actual photo is ever shown, so staff
cannot eyeball an image to set its role, judge registration visibility, or spot a person's
reflection — they must click `Open in Archive` and leave the app for Box on every single file.

This is not a load failure — it is **by design of the preserved mockup**: the tile has never
carried image bytes. `EvidenceCard` draws a coloured `<div>` placeholder, not an `<img>`
(`mockup-app/src/screens/CaseDetail.tsx:509` — `<div className={styles.thumb}
style={{ backgroundColor: ev.thumbColor ?? '#5a5a64' }}>`), and the same `thumbColor`
placeholder pattern backs the EVA order list (`mockup-app/src/components/ImageOrderList.tsx:189`).
The `Evidence` model has no preview field at all: `thumbColor?` is documented as
*"Optional placeholder thumbnail tint (no real image bytes in the mock)"*
(`packages/domain/src/model/types.ts:120-121`); the only real handle to the pixels is
`boxFileUrl?` (`types.ts:127`), which the card exposes solely as the new-tab
`Open in Archive` link (`CaseDetail.tsx:548-554`). Where `thumbColor` is unset (live/parsed
evidence, as in the screenshot) the block falls back to the default `#5a5a64` grey.

## Change

Give the Evidence tile a real inline preview. This needs both a byte source and a CSP-legal
delivery path:

- **Source of pixels.** Add a preview/thumbnail handle to the `Evidence` contract
  (`packages/domain/src/model/types.ts`) — e.g. a Data-API-relative thumbnail URL — and
  populate it from wherever the image lives (Blob `cespkevidstdev01`, or the Box
  file via `boxFileId`).
- **Delivery must clear the CSP.** `mockup-app/staticwebapp.config.json` pins
  `img-src 'self' data: blob:` and `connect-src 'self' https://cespk-api-dev…azurewebsites.net
  https://login.microsoftonline.com`. A raw `<img src>` pointed at a Box host or a blob-storage
  host is therefore **blocked**; the bytes must be served **same-origin through the Data API**
  (`'self'`) — which also lets the API attach the Blob SAS / Box auth server-side rather than
  leaking a credentialed URL to the client — or fetched via the allowed `connect-src` and shown
  as a `blob:` object URL.
- **Render.** Replace the `styles.thumb` placeholder `<div>` in `EvidenceCard`
  (`CaseDetail.tsx:509`) with an `<img>` that falls back to the current coloured/labelled block
  when no preview handle is present, so partial cases and the `OVERVIEW`/`EXCLUDED` overlays
  still degrade gracefully. Mirror the same treatment in `ImageOrderList.tsx`.

Depends on real image bytes reaching the case (TKT-002 PDF image extraction) and pairs with the
AI image-analysis tooling (TKT-016), which also needs the pixels on the tile. Keep `Open in
Archive` as the full-size fallback.

## Acceptance

- [ ] An evidence image with bytes available renders a visible thumbnail inside its card (not a
      grey `thumbColor` block) on the case **Evidence** tab.
- [ ] The preview is served/fetched over a CSP-legal path (same-origin Data API, or `blob:`/
      `data:`); no `img-src` or `connect-src` violation appears in the browser console.
- [ ] No credentialed URL (Blob SAS / Box auth token) is exposed to the client — auth is applied
      server-side.
- [ ] A partial/unarchived image with no preview handle still degrades to the existing
      coloured/labelled placeholder rather than a broken-image icon.
- [ ] The `OVERVIEW` / `EXCLUDED` overlays, the `Role` dropdown, the reflection toggle, and
      `Open in Archive ↗` continue to work over the thumbnail.
- [ ] The EVA order list (`ImageOrderList`) shows the same real thumbnails.
