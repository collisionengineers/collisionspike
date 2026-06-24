# Phase 4a — Inspection-address corpus revamp (from the 2-year EVA full-address export)

> **Status: PLANNED / not built.** Integrated into the phase structure on 2026-06-24 (from
> `docs/plans/to-integrate-into-phases/`). Backed by **ADR-0016** (_Proposed_). **ADR-0013 stays
> binding** — there is **no runtime inspection-address matcher**; everything here is **offline
> corpus-build**. Consolidated open questions: [../../open-questions.md](../../open-questions.md).
> Sits under Phase 4a in [ROADMAP.md](../../../ROADMAP.md); pairs with
> [../../architecture/inspection-address-corpus.md](../../architecture/inspection-address-corpus.md).

## What the operator dropped in

A new EVA export, `fullevaexportinspectionaddresses.xlsx` — **the last 2 years of every inspection
address** — proposed as the **new source of truth, to entirely replace the current records**, plus three
helper-method ideas.

**Verified profile of the file** (opened directly): **17,738 rows = 1 header + ~17,737 data rows**, 10
columns: `Case ID · Vehicle Reg · Insured Name · Claim No · Created Date · InspLocAdd · InspLocPCode ·
InspLocName · InspLocCont · InspLocAdd1`. Unlike the old `Loc`-only artifact, this carries **full
addresses** (street line, postcode e.g. `B5 6JX`, site name e.g. "Somstar Recovery & Storage", contact,
second line). Many rows are literally `Image Based Assessment` in the address field.

This is far richer than today's live corpus (~871 `cr1bd_inspectionaddress` rows = **697 suggested**, from
the prior `codexwork` CSV, **+ 174 hand-curated Confirmed Physical**).

## The decision (ADR-0016) — adopt for the *suggestion layer*, ADR-0013 unchanged

This export becomes the new source for the **suggestion layer** only. It does **not** reopen ADR-0013:
the inspection address remains **offline-derived suggestions → staff manual pick → "Image Based
Assessment" with a reason**. There is **no per-Case runtime resolver**. The three helper methods bind to
the **offline corpus-build layer**:

| Helper (operator's words) | Verdict | How it is allowed |
|---|---|---|
| **#1 — provider always image-based → autofill** | **Operator-designated, surfaced not auto-applied** | "Always image-based" is **operator-designated for specific providers only** — it is **not** statistically derived from the export (a high image-based % in a 2-year export often signals **missing data, not a deliberate policy**). Carry it as an operator-set per-provider default (`WorkProvider.inspectionLocationPolicy`); the no-silent-image-based rule (`address-policy.ts`) still requires a recorded reviewer decision + reason. |
| **#2a — most-common locations** | **Implemented NOW (offline ranking)** | Rank suggestions per provider by **frequency + recency** (`Created Date`) — descriptive ordering metadata **surfaced in the Code App now** (not deferred to M2). Never a runtime lookup. |
| **#2b — location closest to accident** | **Implemented NOW as an ordering signal** | Implemented as a **suggestion-ordering** signal only (**never an auto-select, so ADR-0013 is not reopened**): use an **accident location/postcode WHEN PRESENT** in the instruction (formats vary — opportunistic, best-effort parse), else fall back to **claimant home-address proximity** (a soft signal, not a guarantee — they may have been travelling). Needs two best-effort parser extractions + gated geocoding (`AZURE_MAPS_ENABLED=false`). |
| **#3 — vision-AI / geolocate to find off-corpus locations** | **Offline mining only, gated** | Permitted as offline corpus enrichment (e.g. Azure Maps geocode for site dedup, `AZURE_MAPS_ENABLED=false`), never a per-Case runtime resolver. |

## "Entirely replace" — confirmed scope

The corpus is **fully replaced from the vetted EVA export** (operator decision). **Back up the current
`cr1bd_inspectionaddress` corpus to the repo FIRST** (a dated snapshot under the build scripts' outputs),
then regenerate from the export. **Every imported row is a SUGGESTION** (`decisionMode=Unknown`) — **ADR-0013
stays intact**: staff still pick per case and **nothing auto-confirms**. The full-replace covers the
`suggested:*` layer; the existing probe-and-skip guard still protects any operator-confirmed rows unless the
operator explicitly supersedes them too.

## Build plan (offline)

0. **Back up the current corpus to the repo FIRST.** Snapshot every live `cr1bd_inspectionaddress` row to a
   dated file under the build scripts' outputs **before** any replace runs — the full-replace is only safe
   with a recoverable backup in the tree.
1. **Profile** the `.xlsx` precisely — row count, column completeness, `% Image Based Assessment`, postcode
   coverage, distinct sites. (Done at headline level above; do a full profile before coding.)
2. **New offline pre-processor** (sibling to the existing `raw/.../outputs/_scripts` analysis). The export
   has **no `provider_code` column**, so it must **map each inspection to a provider/Principal** by parsing
   the **`Case ID` leading alpha prefix** (e.g. `CCPY26050` → Principal `CCPY`). **BRANCH:** if the `Case ID`
   is **VRM-shaped**, the row is an **INDIVIDUAL / private-claimant case keyed by VRM — no Principal code**
   (the new Case/PO keying rule). Then: drop "Image Based Assessment" rows, normalise postcodes
   (postcode.io), and **dedup to unique physical sites on the FULL ADDRESS** (provider + full address, with
   postcode as the secondary key), emitting the **8-column shape** `16-seed-suggested-addresses.ps1` consumes
   (`provider_code, loc_value, address_index_for_loc, full_address, address_postcode, address_status,
   evidence_source, evidence_detail`) + the deterministic `cr1bd_name` key. Carry per-site **frequency +
   recency** as ranking metadata (surfaced in the Code App now). For the **#2b** ordering signal, also make
   two best-effort parser extractions — **accident location/postcode (when present)** and **claimant
   home-address** — as soft proximity inputs (gated geocoding, never an auto-select).
3. **`16-seed-suggested-addresses.ps1` → add a `-ReplaceSuggestions` mode** — every imported row is written
   as a SUGGESTION (`decisionMode=Unknown`); delete/regenerate the `suggested:*` rows, keep the
   confirmed-row protection. Update `17-verify-suggested-addresses.ps1` for the new counts and assert **no
   Case row is touched**.
4. **Reconcile the lower docs to ADR-0016** — `docs/architecture/inspection-address-corpus.md` (replace the
   `codexwork`-master-CSV narrative with the EVA-export source), `docs/requirements/inspection-address.md`,
   and this plan.

## Open questions

See [../../open-questions.md](../../open-questions.md) → "Phase 4a — inspection-address revamp".
