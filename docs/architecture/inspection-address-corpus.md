# Inspection-address corpus — how the suggestions are derived (offline) and what the CSVs are for

**Canonical reference for the inspection-address data.** Pairs with
[ADR-0013](../adr/0013-loc-export-artifact-no-runtime-address-matching.md) (the binding decision — **no
runtime matcher**) and [ADR-0016](../adr/0016-inspection-address-corpus-eva-export.md) (the 2026-06-24
revamp — regenerate the suggestion layer from the EVA full-address export; ADR-0013 re-affirmed). Pairs
with [`data-model.md`](./data-model.md) (the `cr1bd_inspectionaddress` table). Cross-referenced from
[`../requirements/inspection-address.md`](../requirements/inspection-address.md).

> **Live source (2026-06-24).** The suggestion layer is now regenerated from the **2-year EVA
> full-address export** (`fullevaexportinspectionaddresses.xlsx`, ~17,737 inspection rows) via a new
> **offline pre-processor**, replacing the prior `codexwork` master CSV as the *live* source (the
> `codexwork` CSV is preserved below as historical/prior provenance). The pipeline (schema columns,
> pre-processor, `-ReplaceSuggestions`, backup-first, Code-App ranking) is **built offline 2026-06-24**;
> the **live `-Apply` replace has NOT run** (operator step). ADR-0013 is **unchanged** — this is
> offline corpus-build + suggestion-**ordering** only; nothing auto-confirms.

## The model (one path)

EVA field 9 needs the **full inspection address**. EVA holds it but its export only surfaces a `Loc` — a
full or (~57% of located cases) **part** postcode. So `Loc` is an **EVA-export artifact, not an intake
input**; in live intake the full address is usually **not in the documents** and is **worked out
manually** by staff.

The full addresses are mined **offline** from Collision Engineers' own EVA **case history**, per
provider, deduped to unique physical sites, and loaded as live, provider-scoped **suggestions** in
`cr1bd_inspectionaddress`; staff **pick/edit** one, or record "Image Based Assessment" with a reason.
There is no runtime resolver (ADR-0013).

```
fullevaexportinspectionaddresses.xlsx           (~17,737 EVA inspection rows; full address + postcode + site name)
   │  preprocess-eva-inspection-export.py        (offline pre-processor)
   │    · provider = UPPERCASED leading-alpha prefix of Case ID (CCPY26050 → CCPY); VRM-shaped Case ID = INDIVIDUAL, excluded
   │    · drop "Image Based Assessment" + no-site rows; normalise postcode (deterministic, no network)
   │    · dedup on (provider, FULL ADDRESS), postcode secondary; compute frequency + recency + rank
   ▼
dataverse/.build/sources/inspection-suggestions-from-eva-export.csv   (the new seed input)
   │  16-seed-suggested-addresses.ps1 -ReplaceSuggestions  (DRY-RUN default; -Apply = operator)
   ▼
cr1bd_inspectionaddress  (sourceLabel='suggested:eva_export', decisionMode=Unknown, + frequency/lastSeen/rank)
   ▼  Code App Address tab → suggestions ORDERED by rank, "seen N times · last <date>" hint → staff manual pick / edit
EVA field 9 (or "Image Based Assessment" + reason)
```

## The key file (the live source)

`fullevaexportinspectionaddresses.xlsx` (under
`docs/plans/to-integrate-into-phases/inspection-address-revamp/`) — the **2-year EVA full-address
export**, ~17,737 inspection rows + header, 10 columns: `Case ID, Vehicle Reg, Insured Name, Claim No,
Created Date, InspLocAdd, InspLocPCode, InspLocName, InspLocCont, InspLocAdd1`. `Created Date` is a
`dd/mm/yyyy` string. **Provider / Principal is parsed from the `Case ID` leading alpha prefix**
(uppercased — `CCPY26050` → `CCPY`; prefix length varies 2–5 chars); a **VRM-shaped `Case ID`** is an
**INDIVIDUAL / private-claimant case keyed by VRM** (no Principal code).

The **offline pre-processor** `dataverse/.build/sources/preprocess-eva-inspection-export.py` profiles
the export, parses provider/Principal (branching VRM-shaped rows), drops "Image Based Assessment" +
no-site rows, normalises postcodes (deterministic, no network), and **dedups ~17,737 inspections to
unique physical sites per provider on the FULL ADDRESS** (postcode secondary). It emits
`dataverse/.build/sources/inspection-suggestions-from-eva-export.csv` with columns:
`provider_code, loc_value, address_index_for_loc, full_address, address_postcode, address_status,
evidence_source, evidence_detail, frequency, last_seen, rank, case_key_kind`. The first eight are the
shape `16-seed-suggested-addresses.ps1` consumes; the last four carry the ranking metadata + key kind.
**VRM-keyed individual rows are recognised + counted in the run summary but EXCLUDED from the suggestion
CSV** (a one-off individual site is not a reusable per-provider suggestion).

`16-seed-suggested-addresses.ps1` (idempotent upsert on the `cr1bd_name` key) defaults its `-CsvPath`
to that CSV, writes `decisionMode=Unknown` + `sourceLabel='suggested:eva_export'` + the suggestion
provenance note, and **also writes three new ranking columns** when present:

- `cr1bd_suggestionfrequency` — # of source inspections deduped into this site (per provider).
- `cr1bd_lastseenon` — most-recent `Created Date` among the deduped inspections.
- `cr1bd_suggestionrank` — 1-based rank within the provider scope by (frequency desc, lastseen desc).

**`-ReplaceSuggestions` (full-replace, backup-first).** In `-Apply`, `-ReplaceSuggestions` regenerates
**only** rows whose `sourceLabel` startswith `'suggested'` — deleting suggested rows not in the new set
and **PRESERVING the hand-curated Confirmed rows** (the probe-and-skip guard stays). A full truncate
happens only on explicit operator confirmation, and only after the **repo backup (step 16a)**. The
**default is DRY-RUN** (no `-Apply` ⇒ no tenant contact); DRY-RUN reports what would be deleted / kept.

**The hard split (load this rule into memory):**

- **Has a site → live suggestion.** A row carrying a real physical site (a full street address, **or** a
  site name + postcode with an empty `InspLocAdd` — ~68% of rows) is emitted as a suggestion
  (`decisionMode=Unknown`, `sourceLabel='suggested:eva_export'`). "Drop image-based" ≠ "drop empty
  `InspLocAdd`": a named site with a postcode is still a usable site.
- **No site → dropped.** "Image Based Assessment" rows (the marker appears in `InspLocName` **or**
  `InspLocAdd`, case-insensitive) and rows with no physical location are dropped — never suggested.
  Bare-partial / no-address backlog remains a future-investigation concern; the live system never
  suggests a partial or a bare postcode.

`dataverse/.build/17-verify-suggested-addresses.ps1` asserts every suggested row is
`decisionMode=Unknown` + `sourceLabel startswith 'suggested'`.

### Code App ranking surface (ordering only — ADR-0013 unchanged)

`SuggestedAddress` (`mockup-app/src/data/types.ts`) gains optional `frequency` / `lastSeen` / `rank`;
the Dataverse adapter maps them from the new columns and `dataverse-source.inspectionAddressSuggestions`
**ORDERS** by (rank asc, else frequency desc, lastSeen desc). CaseDetail surfaces a small
"seen N times · last <date>" hint. This is **descriptive ordering metadata only — never an
auto-select**; staff still pick/edit per case, so ADR-0013 is not reopened.

### Deferred (operator / sibling)

The **live `-Apply` replace** is an operator step (not yet run). The **#2b "closest to accident"
proximity-ordering signal** — two best-effort parser extractions (accident location/postcode when
present, else claimant home address) feeding **gated** geocoding (`AZURE_MAPS_ENABLED=false`) — is a
**sibling-parser + gated-geocoding concern, deferred**; like the ranking above it would be
suggestion-**ordering** only, never an auto-select. **Vision-AI / geolocate** off-corpus mining (ADR-0016
helper #3) stays offline-only + gated. None of these reopen ADR-0013.

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
| `…/codexwork/inspection_locations_and_provider_principal.csv` | **HISTORICAL / prior provenance** — the prior master `(provider, Loc) → full address` sheet (yielded ~697 suggested rows). **Superseded as the live source 2026-06-24 by the EVA full-address export** (ADR-0016); kept for provenance, no longer loaded. | (historical) |

> `raw/` is git-ignored (PII drop-zone). This doc is the committed, canonical description of that
> local data; a short `raw/principalandrepairersheets/outputs/README.md` (local-only) points back here.

## What this is NOT

There is **no runtime inspection-address matcher** — no Function, flow, or connector that takes a Case's
`Loc` and resolves an address on the fly. That was a misread of `Loc` and was removed 2026-06-23
(ADR-0013). Future improvement is **more offline mining** (the 2026-06-24 EVA full-address-export
regeneration per ADR-0016 is exactly that) and **suggestion-ordering** (frequency/recency now; gated
proximity later), **not** a runtime resolver — the suggestion layer being richer or better-ordered does
**not** change the manual-pick model.
