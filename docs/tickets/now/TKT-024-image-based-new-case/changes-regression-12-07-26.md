# Regression changes — TKT-024 — 2026-07-12

## Status
implemented and offline-tested; deployment and live proof pending

This follow-up removes the remaining Insured Name input and repairs the field grouping while preserving the original images-only intake scope.

## Changes

- Images-only intake no longer renders `Insured name`, and its create request cannot carry `insuredName`, provider, principal or provider-reference values left in local state by another intake mode.
- `Claimant name`, registration, make, vehicle model and mileage now share one two-column details grid in keyboard order; claimant telephone and email no longer split that images-only identity group.
- The grid, lookup control, paired fields, field metadata and action rows collapse to one column at narrow widths so labels, required markers and messages do not overflow at high zoom.
- Instruction-led intake keeps its existing policyholder field and payload semantics; no stored insured data is deleted or remapped.
- Added pure request-boundary and field-order tests in `manual-intake-create.test.ts`.
- Added rendered `ManualIntake` component tests for the images-only workflow: the insured and instruction-only controls are absent, the claimant/vehicle controls share one labelled keyboard-order group, only canonical creation fields block submission, claimant identity survives creation, and provider/insured values cannot leak into the request.
- Labelled the claimant-and-vehicle grid as one accessible group so its visual grouping is also exposed to assistive technology.

## Offline evidence

- `npm run test --workspace mockup-app -- --run src/screens/ManualIntake.test.tsx` — 1 file, 3 rendered component tests passed.
- `npm run test --workspace mockup-app` — 46 files, 490 tests passed.
- `npm run build --workspace mockup-app` — production TypeScript/Vite build passed.
