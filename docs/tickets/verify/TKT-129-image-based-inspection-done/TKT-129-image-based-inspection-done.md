---
id: TKT-129
title: Simplify the inspection address or Image Based Assessment choice
status: verify
priority: P1
area: ui
tickets-it-relates-to: [TKT-109, TKT-079, TKT-130]
research-link: docs/tickets/verify/TKT-129-image-based-inspection-done/evidence/operator-note.md
plan: PLAN-003
---
# TKT-129 — Image-based providers: inspection field must auto-complete as Done + fix the inverted wording

## Problem

For providers that always use Image Based Assessment the case page correctly notes the policy, but the inspection-address field still counts as not Done, blocking readiness. The note wording is also inverted: "This provider is usually recorded as Image Based Assessment — use the override below if the vehicle CANNOT be inspected in person" (the override is for when it CAN be inspected). The image-based providers should be auto-populated from the corpus evidence already obtained (QDOS/PCH/AX/SBL confirmed image-led).

## Evidence

- [evidence/operator-note.md](./evidence/operator-note.md) — verbatim operator workstream item, 2026-07-08.
- TKT-075 corpus run report: QDOS 99.9% / PCH 99.6% / AX 99.2% / SBL 99.5% image-based.
- TKT-109 (backlog) is the pre-fill sibling; TKT-079 built the informational note.

## Proposed change

PROPOSED (not built): for always_image_based providers, auto-satisfy the inspection requirement as "Image Based Assessment" (recorded value, not just a note), leaving a staff override to a physical address; correct the note wording; seed/confirm the always_image_based provider policy flags from the corpus evidence.

## Acceptance

- A case for an always_image_based provider (e.g. QDOS) shows the inspection field populated "Image Based Assessment" and marked Done without manual entry.
- Staff can still override to a physical address.
- The note wording is corrected (no inverted logic).
- always_image_based flags seeded for the evidenced providers; counts recorded in changes.md.
- Verified live on a QDOS case.

## Reopened follow-up — 2026-07-12

Remove the explanatory provider-policy paragraph and replace the current mixed override/search presentation with one direct choice. The private operational context supplied with this request is not deployment copy and must not appear in the app, ticket implementation notes or release messaging.

### Acceptance
- The exact paragraph beginning `This provider works from photos` is removed from every rendered state and built asset.
- The screen presents one concise choice equivalent to `Choose an inspection address or set as Image Based Assessment`, using controls rather than scattered explanatory sentences.
- Selecting `Image Based Assessment` hides suggested addresses, search, address entry and address-specific actions; selecting the address path reveals them. Switching remains reversible until the explicit Save in TKT-153.
- Only providers explicitly configured as always image-based may prefill that choice. Every other provider starts address-first/unselected and never infers Image Based Assessment from absence of an address.
- A prefilled provider choice remains visible and changeable by authorised staff; a manual physical address replaces the prefill only when saved.
- Required reason/audit behavior is captured without reintroducing a long policy explanation or hidden contradictory controls; saved decisions remain attributable and truthful.
- Handler-facing copy follows `AGENTS.md`, uses no internal/platform language, and contains none of the private rationale from the operator's contextual note.
- Component tests cover designated provider prefill, ordinary provider default, both choices, switching, hidden controls, Save/Cancel and reload.
- Deployed Chrome proof covers one designated provider and one ordinary provider at desktop, narrow width and 200% zoom.

## Research

Distilled 2026-07-08 from the operator workstream note (see Evidence). 

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
- [evidence/](./evidence)
- [regression changes](./changes-regression-12-07-26.md)
- [operator follow-up](./evidence/operator-followup-12-07-26.md)
