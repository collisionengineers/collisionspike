# Inspection-address corpus outputs (local, git-ignored)

> Local PII drop-zone — **not committed**. The canonical, committed description lives in
> [`docs/architecture/inspection-address-corpus.md`](../../../docs/architecture/inspection-address-corpus.md)
> (and the decision in `docs/adr/0013-…`). Read that first.

These are the **offline** analyses of Collision Engineers' Box/EVA case history that produce the
inspection-address seed inputs. `Loc` here is the **EVA-export postcode column** (from `everyrepairloc.xlsx`),
not an intake field. The goal everywhere is the **full** inspection address; partials/bare postcodes are a
**future-investigation backlog** and are **never** loaded into the live system or suggested. There is **no
runtime matcher** (removed 2026-06-23, ADR-0013).

| File | Purpose | Feeds |
|---|---|---|
| `reports/loc_principal_analysis.md` | The `Loc` analysis (57%-partial figure, shared multi-principal sites). | — (analysis) |
| `reports/provider_corpus_recommendation.csv` | Per-principal SEED/ARCHIVE + inspection modality. | `10`/`12-seed` |
| `claudeschoice/top_inspection_locations.csv` | Top inspection postcodes by frequency (known-yard flag). | `11`/`12-seed` |
| `task1_garages_vs_repairer/matches.csv` | Job-sheet garage ↔ EVA repairer matches. | `11-seed` |
| `task5_principal_postcode_profiles/full_postcodes_repeated.csv` | Per-principal repeated FULL postcodes. | `12-seed` |
| `reports/principal_address_worklist.md` · `reports/loc_part_postcodes_by_principal_rollup.csv` · `useraddedpartiallocs.txt` | The **partial backlog** (offline future work; never live). | — |
| `provider_email_audit/provider_email_audit_2026-06-22.csv` | Provider → sender email domains. | `15-seed` |
| `…/codexwork/inspection_locations_and_provider_principal.csv` | Master `(provider, Loc) → full address` sheet; **FULL-address rows only** (697/~3,497, live 2026-06-23) become live suggestions. | `16-seed` |
