---
id: TKT-014
title: Remove the acme.co.uk placeholder from provider fields
status: done
priority: P3
area: ui
tickets-it-relates-to: []
research-link: docs/tickets/done/TKT-014-acme-placeholder/TKT-014-acme-placeholder.md
---

# Remove the acme.co.uk placeholder from provider fields

## Problem
Every provider shows `acme.co.uk` as grey placeholder text in a text box — needs fixing (it should show
the real value, or an appropriate empty/placeholder, not a fake domain).

## Evidence
A leftover placeholder string is rendered in a provider field component. See the research pack + the
`acme.png` screenshot for the exact field.

## Proposed change
Replace the hard-coded `acme.co.uk` placeholder with the real bound value (or a neutral placeholder) on
the provider field.

## Acceptance
No provider field shows `acme.co.uk`; the field renders the real value or a neutral empty state.

## Research
- Operator stub: [acme.md](TKT-014-acme-placeholder.md) (see `acme.png` alongside it)
- Research pack: [research/acme.md](TKT-014-acme-placeholder.md)

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
