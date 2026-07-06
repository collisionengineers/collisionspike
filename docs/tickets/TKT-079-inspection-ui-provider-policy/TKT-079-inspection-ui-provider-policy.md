---
id: TKT-079
title: Address picker polish — provider default chip, distance hints, show-more
status: backlog
priority: P2
area: ui
tickets-it-relates-to: [TKT-062, TKT-076, TKT-011]
research-link: docs/tickets/TKT-079-inspection-ui-provider-policy/evidence/operator-note.md
---

# Address picker polish — provider default chip, distance hints, show-more

## Problem

Two usability gaps in the CaseDetail address flow:

1. **Provider policy is invisible.** Some providers are designated `always_image_based`
   (their `inspectionLocationPolicy` lives in the provider corpus and the mapper), but the
   CaseDetail confirm path never surfaces it — a handler working an always-image-based
   provider's case gets no hint that "Image Based Assessment" is that provider's default, and
   a `required_address` provider gets no cue that a physical address is expected.
2. **Suggestion rows are bare.** No distance hint (TKT-076 adds `distanceMiles` to the
   payload), no provider chip distinguishing provider-scoped rows from labelled global
   fallback rows, and the capped list has no "show more" expansion.

## Evidence

- `evidence/operator-note.md` — plan Phase E + root cause 6 (2026-07-06 investigation).
- `mockup-app/src/screens/CaseDetail.tsx` — the address tab / confirm path.
- Provider policy fields exist in the corpus + `api/src/lib/mappers.ts` but are unused in
  this flow.
- Depends on TKT-076 for `distanceMiles` + the labelled-fallback flag in the payload.

## Proposed change

PROPOSED (not built):

- **Provider policy plumb**: pass the provider's real `inspectionLocationPolicy` to the
  CaseDetail address flow. For operator-designated `always_image_based` providers show an
  "Image Based Assessment (provider default)" chip — surfaced, **never auto-applied**;
  `required_address` keeps the existing audited-override semantics.
- **Suggestion-row hints**: a distance hint (from `distanceMiles`), a provider chip (scoped vs
  common/global rows), and a capped list with "show more" expansion.
- All strings in handler language (sentence case, no engineering vocabulary; "provider
  default" is fine).

## Acceptance

- [ ] A case for an `always_image_based` provider shows the provider-default chip in the
      address flow; picking Image Based Assessment still requires the recorded reason
      (ADR-0013 CHECK constraint untouched).
- [ ] Nothing is auto-selected by the chip — it is informational only.
- [ ] A `required_address` provider's case keeps the audited-override behaviour.
- [ ] Suggestion rows show distance (when available) and a provider/common chip; the list is
      capped with a working "show more".
- [ ] All new strings pass the UI-language rule (no engineering terms rendered).

## Verification requirements (proof standard)

1. **Offline** — SPA build green; component-level checks where the suite covers CaseDetail;
   `node verify-all.mjs` green.
2. **Gate** — SPA deploy recorded in [changes.md](./changes.md).
3. **Live click-through** — on the deployed SPA, one case per policy class
   (`always_image_based`, `required_address`, unset): screenshot the chip/no-chip states, the
   distance + provider hints, and the show-more expansion. Record in
   [verification.md](./verification.md).
4. **Constraint proof** — confirm (live attempt) that Image Based Assessment without a reason
   is still rejected.
5. **Language audit** — list the new rendered strings in verification.md with a note that
   each passed the UI-language rule.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Phase E); excerpt in [evidence/](./evidence/).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt)](./evidence/operator-note.md)
