---
id: TKT-062
title: Inspection-address picker returns entire corpus — add ranked shortlist
status: done
priority: P2
area: ui
tickets-it-relates-to: [TKT-011]
research-link: docs/architecture/inspection-address-corpus.md
---

# Inspection-address picker returns entire corpus — add ranked shortlist

## Problem

The suggestions endpoint returns **every** catalogue row with no cut. `inspectionAddressSuggestions`
(`services/data-api/src/features/cases/inspection-routes.ts`, route `cases/{id}/inspection-suggestions`) runs
`SELECT * FROM inspection_address WHERE source_label LIKE 'suggested%'` with **no `LIMIT`** and, after
provider scoping, returns `sortSuggestions(scoped.length > 0 ? scoped : all)` — so an **empty
provider-scoped set silently falls back to the ENTIRE corpus** (line 61), and when the Case/PO has no
leading-alpha principal it returns all rows unconditionally (line 57). The SPA renders the payload 1:1:
`CaseDetail.tsx` (~line 1815) maps `suggestions` straight into `SuggestedLocationRow` with no client cap.
Net effect: staff picking an inspection address are shown **hundreds** of locations (the live suggestion
corpus is ~2,035 rows). `sortSuggestions` orders by rank/frequency/last-seen but never truncates, and
there is no case-postcode signal in the ranking at all.

## Change

Server-side **rank + cap**, no runtime matcher (ADR-0013 — pure string ranking, ordering only):

- Rank suggestions by, in order: **case-postcode outward-code match** (the case's own postcode's outward
  code equals the row's) > **provider-scoped** (via the canonical `provider_code`) > `suggestion_rank` > `suggestion_frequency` >
  `last_seen_on` — extending the existing `sortSuggestions` tie-break, using the ADR-0016 metadata already
  in the schema (`database/baseline/040_inspection_address.sql`).
- `LIMIT` the returned shortlist to **~8** rows.
- **Replace the empty-scope → ALL fallback** (line 61) with a labelled **top-N global** set (clearly
  marked as unscoped, not silently dumping the corpus); same treatment for the no-principal path.
- Client: render the shortlist, plus a **"Search all locations…"** typeahead that expands to the full
  corpus on demand (so the long tail stays reachable without being the default view).

Nothing auto-selects — staff still pick/edit, or record Image Based Assessment (ADR-0013 unchanged).

## Acceptance

- [ ] The endpoint returns at most ~8 ranked rows for a case with a scoped provider set.
- [ ] Case-postcode outward-code matches sort ahead of provider-scoped, which sort ahead of rank/frequency/recency.
- [ ] An empty provider-scoped set returns a **labelled top-N global** shortlist — never the full unscoped corpus 1:1.
- [ ] A Case/PO with no leading-alpha principal likewise returns a capped, labelled set (not all rows).
- [ ] The SPA shows the shortlist by default and offers a "Search all locations…" typeahead that reaches the full corpus.
- [ ] No runtime address matcher / geocode is introduced (ADR-0013): ranking is pure string comparison over existing columns.
- [ ] Honest-empty behaviour preserved — any failure still resolves `200` with `[]`.

## Artifacts

- [changes.md](./changes.md)
- [verification.md](./verification.md)
