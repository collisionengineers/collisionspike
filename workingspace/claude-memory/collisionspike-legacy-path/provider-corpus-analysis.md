---
name: provider-corpus-analysis
description: Findings + reproducible scripts from the EVA principal/garage/location data analysis (raw/principalandrepairersheets)
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The `raw/principalandrepairersheets/` EVA exports were analysed into
`raw/principalandrepairersheets/outputs/` (7 task folders + `claudeschoice/` +
`reports/`). Reproduce with `python outputs/_scripts/run_all.py` (pinned TODAY
2026-06-18, offline; needs `openpyxl` + `xlrd`; `.xls` files are legacy BIFF, not TSV).

Load-bearing findings for the Dataverse corpus work (relate to [[live-services-boundary]]):

- **EVA principal *code* is the reliable join key, not the name.** 52/58 job-sheet
  providers map straight to a principal code with real case volume; only 2 are paper
  (Arianna = per-VRM, Questgates). Seed `WorkProvider` on `principalCode`.
- **LEGAL contact Name is a placeholder "FAO The Court"; the real firm is in the
  Address** (`C/O Zenith Lawyers …`). `_lib.derive_firm_from_address()` recovers it —
  the importer must do the same or the corpus fills with "FAO The Court". 426/438
  LEGAL contacts are live.
- **REPAIRER list (Scotland-heavy G/KA/ML/EH/PA) ≠ where inspections happen**
  (England-heavy CH/B/M/OL/LU/RH). Only ~30% of full Locs match a listed repairer; 16
  never appear. The real image-source sites are **storage yards** — Shaun Marnell
  CH46 4TP (867), Accident Specialists RH10 9NT, Somstar B5 6JX, HS Recovery M12 5FX —
  and these exact postcodes are named in the job-sheet image-source notes. Mining
  those free-text notes is the way to get provider→yard (ImageSource) links (the
  garages sheet has no provider column — the long-standing garage↔provider gap).
- **Job sheet under-covers active providers:** 137 principals active <12m are NOT on
  the 50-row job sheet (the `CONSIDER` rows in `reports/provider_corpus_recommendation.csv`).
- **Dormant tail:** of 440 principals, 264 not used in 12m, 68 not in 48m → archive
  (`active=false`). 20 red-herring non-provider codes (engineer/staff/etc.) + 2 unknown.
- **57% of located cases carry only an outward/partial postcode** → these partials are an
  **offline future-investigation backlog, NOT a runtime input**. There is **no** runtime
  address-matching service (the one that misread `Loc` was ripped out 2026-06-23 — see
  [[loc-export-artifact-no-address-matcher]] / ADR-0013); the live corpus is **full addresses only**.

`reports/provider_corpus_recommendation.csv` = one actionable row per principal
(SEED active / CONSIDER / ARCHIVE / EXCLUDE / REVIEW). This supersedes the older
`docs/reference/provider-corpus-status.md` snapshot.
