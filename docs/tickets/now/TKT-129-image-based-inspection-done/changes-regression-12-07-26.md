# Regression changes — TKT-129 — 2026-07-12

## Status
implemented and tested offline; deployment and fresh Chrome proof pending

The earlier server-owned provider default remains. The Address tab now presents one controlled choice between an inspection address and Image Based Assessment.

## What changed

- Removed the paragraph beginning `This provider works from photos` from the rendered source and production build.
- Replaced the scattered suggestion list plus override checkbox/button with one labelled radio choice.
- Selecting Image Based Assessment hides search, suggested addresses and address-only actions. Selecting Inspection address reveals them again.
- A new Image Based Assessment choice joins its required reason to the existing explicit Save changes transaction; it performs no isolated write.
- An existing saved Image Based Assessment choice remains visible without inventing a new edit or demanding a replacement historical reason.
- Switching away from an unsaved physical-address choice and back restores that draft and its source note.
- Ordinary unknown/manual cases remain address-first. The UI reflects saved image-based truth but does not infer it from an empty address.
- The choice row wraps at narrow widths rather than forcing horizontal overflow.

## Offline evidence

- `npm run test --workspace mockup-app -- --run src/components/InspectionChoice.test.tsx src/screens/case-edit-session.test.ts` — 12/12 passed.
- `npm run test --workspace mockup-app` — 48 files / 509 tests passed after rebasing onto current `main`.
- `npm run build --workspace mockup-app` — passed.
- Source and built-asset scan found zero copies of the removed paragraph and old override labels.

## Pending live proof

- Deploy the reviewed SPA head.
- In Chrome, verify one configured image-based provider and one ordinary provider at desktop and narrow width, including choice switching, hidden controls, Save/Cancel and reload.
