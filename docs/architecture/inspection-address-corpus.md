# Inspection-address corpus — how the suggestions are derived (offline) and what the CSVs are for

**Canonical reference for the inspection-address data.** Pairs with
[ADR-0013](../adr/0013-loc-export-artifact-no-runtime-address-matching.md) (the decision) and
[`data-model.md`](./data-model.md) (the `cr1bd_inspectionaddress` table). Cross-referenced from
[`../requirements/inspection-address.md`](../requirements/inspection-address.md).

## The model (one path)

EVA field 9 needs the **full inspection address**. EVA holds it but its export only surfaces a `Loc` — a
full or (~57% of located cases) **part** postcode. So `Loc` is an **EVA-export artifact, not an intake
input**; in live intake the full address is usually **not in the documents** and is **worked out
manually** by staff.

The full addresses were therefore mined **offline** from Collision Engineers' own Box/EVA **case
history**, per provider, into a master sheet. Only the rows that carry a **real full address** become
live, provider-scoped **suggestions** in `cr1bd_inspectionaddress`; staff **pick/edit** one, or record
"Image Based Assessment" with a reason. There is no runtime resolver (ADR-0013).

```
Box/EVA case history ──mine offline──▶ master CSV (provider, Loc → full address + status)
                                            │  16-seed (FULL addresses only: 698 of ~3,497)
                                            ▼
                       cr1bd_inspectionaddress  (suggested:* , decisionMode=Unknown)
                                            ▼  Code App Address tab → staff manual pick / edit
                                       EVA field 9 (or "Image Based Assessment" + reason)
```

## The key file (the live source)

`…/codexwork/inspection_locations_and_provider_principal.csv` — the externally-maintained master sheet
(24 columns; 8 consumed by the loader): `provider_code, loc_value, address_index_for_loc, full_address,
address_postcode, address_status, evidence_source, evidence_detail`. Loaded by
`dataverse/.build/16-seed-suggested-addresses.ps1` (idempotent upsert on the `cr1bd_name` key).

**The hard split (load this rule into memory):**

- **Resolved → live suggestion.** A row with a non-empty `full_address` (and an `address_status` *not*
  in the no-address set) is loaded as `cr1bd_inspectionaddress` `decisionMode=Unknown`,
  `sourceLabel='suggested:<status>'`. **698 of ~3,497 rows** qualify today — the static totality at this
  time.
- **Unresolved → future-investigation backlog. NEVER loaded, NEVER suggested.** Rows whose
  `address_status ∈ {needs_full_address_partial_loc, needs_address_lookup, no_loc_recorded,
  image_based_no_physical_location, source_confirms_location_unavailable}` (or with an empty/placeholder
  address) are skipped by the loader. They are a backlog of locations to resolve to a full address
  **later** (then re-seed). **The live system never suggests a partial or a bare postcode.**

`dataverse/.build/17-verify-suggested-addresses.ps1` asserts every suggested row is
`decisionMode=Unknown` + `sourceLabel startswith 'suggested'`.

## Supporting offline analysis (under `raw/principalandrepairersheets/outputs/`)

Point-in-time analysis that produced the seed inputs (one line each; which seed each feeds):

| Output | What it is | Feeds |
|---|---|---|
| `reports/provider_corpus_recommendation.csv` | Per-principal SEED/ARCHIVE classification + inspection modality | `10-seed-workprovider.ps1`, `12-seed-inspection-sites.ps1` |
| `claudeschoice/top_inspection_locations.csv` | Top inspection-location postcodes by case frequency (known-yard flag) | `11-seed-repairers.ps1`, `12-seed-inspection-sites.ps1` |
| `task1_garages_vs_repairer/matches.csv` | Job-sheet garages ↔ EVA repairer (name+postcode match) | `11-seed-repairers.ps1` |
| `task5_principal_postcode_profiles/full_postcodes_repeated.csv` | Per-principal repeated **full** postcodes | `12-seed-inspection-sites.ps1` |
| `reports/loc_principal_analysis.md` | The `Loc` analysis (the 57%-partial figure; shared multi-principal sites) — `Loc` is the EVA export's column, not an intake field | — (analysis) |
| `reports/principal_address_worklist.md` · `reports/loc_part_postcodes_by_principal_rollup.csv` · `useraddedpartiallocs.txt` | The **partial backlog** — districts still awaiting a full address (offline future work) | — (backlog, never live) |
| `provider_email_audit/provider_email_audit_2026-06-22.csv` | Provider → sender email domains | `15-seed-emaildomains.ps1` |
| `…/codexwork/inspection_locations_and_provider_principal.csv` | The master `(provider, Loc) → full address` sheet (above) | `16-seed-suggested-addresses.ps1` |

> `raw/` is git-ignored (PII drop-zone). This doc is the committed, canonical description of that
> local data; a short `raw/principalandrepairersheets/outputs/README.md` (local-only) points back here.

## What this is NOT

There is **no runtime inspection-address matcher** — no Function, flow, or connector that takes a Case's
`Loc` and resolves an address on the fly. That was a misread of `Loc` and was removed 2026-06-23
(ADR-0013). Future improvement is **more offline mining**, not a runtime resolver.
