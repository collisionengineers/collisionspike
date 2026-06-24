# Phase 4a — Inspection-address corpus revamp (from the 2-year EVA full-address export)

> **Status: BUILT + LIVE-REPLACED 2026-06-24.** Offline build done (gated-OFF); the live `-Apply` replace ran
> (16a backup first → 2,035 `suggested:eva_export` live, 503 stale removed, 174 confirmed preserved,
> `17-verify` all-pass). **#2b** proximity deferred; **helper #3 re-scoped** to a live human-confirmed assist (building). Integrated into the phase structure on 2026-06-24 (from
> `docs/plans/to-integrate-into-phases/`). Backed by **ADR-0016** (_Proposed_; see its
> *Implementation note (2026-06-24)*). **ADR-0013 stays binding** — there is **no runtime
> inspection-address matcher**; everything here is **offline corpus-build + suggestion-ordering**.
> Consolidated open questions: [../../open-questions.md](../../open-questions.md). Sits under Phase 4a in
> [ROADMAP.md](../../../ROADMAP.md); pairs with
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
| **#2b — location closest to accident** | **DECIDED (ordering, not dropped) — DEFERRED this turn** | Adopted as a **suggestion-ordering** signal only (**never an auto-select, so ADR-0013 is not reopened**) but **not built this turn** — the pre-processor emits frequency + recency only. When built it would use an **accident location/postcode WHEN PRESENT** in the instruction (formats vary — opportunistic, best-effort parse), else fall back to **claimant home-address proximity** (a soft signal, not a guarantee — they may have been travelling). Needs two best-effort parser extractions (**sibling** `cedocumentmapper_v2.0`) + gated geocoding (`AZURE_MAPS_ENABLED=false`). See the Pending section. |
| **#3 — vision-AI / geolocate to find off-corpus locations** | **Re-scoped (2026-06-24): live, human-confirmed location-suggestion assist** | A **reviewer-invoked** assist for cases the corpus + docs can't place — vision over the case's own photos + Azure Maps geocode of text clues → **candidate suggestions a reviewer confirms** (or Image Based Assessment + reason). Human-in-the-loop, nothing auto-applies — permitted under the ADR-0013 2026-06-24 clarification; gated (`cr1bd_LOCATION_ASSIST_ENABLED`). See [live-location-suggestion-assist.md](./live-location-suggestion-assist.md) (+ deferred GPT-4o: [gpt4o-reasoning-escalation.md](./gpt4o-reasoning-escalation.md)). |

## "Entirely replace" — confirmed scope

The corpus is **fully replaced from the vetted EVA export** (operator decision). **Back up the current
`cr1bd_inspectionaddress` corpus to the repo FIRST** (a dated snapshot under the build scripts' outputs),
then regenerate from the export. **Every imported row is a SUGGESTION** (`decisionMode=Unknown`) — **ADR-0013
stays intact**: staff still pick per case and **nothing auto-confirms**. The full-replace covers the
`suggested:*` layer; the existing probe-and-skip guard still protects any operator-confirmed rows unless the
operator explicitly supersedes them too.

## Build plan (offline)

> **Legend:** **[BUILT 2026-06-24]** = built offline, gated-OFF / DRY-RUN (no live tenant write has run);
> **[OPERATOR]** / **[DEFERRED]** = pending the operator or a later phase.

0. **[BUILT 2026-06-24] Back up the current corpus to the repo FIRST.** Snapshot every live
   `cr1bd_inspectionaddress` row to a dated file under the build scripts' outputs **before** any replace
   runs — the full-replace is only safe with a recoverable backup in the tree. (Step 16a.) The backup
   **capture against live Dataverse** is itself an **[OPERATOR]** run; the script is built.
1. **[BUILT 2026-06-24] Profile** the `.xlsx` precisely — row count, column completeness,
   `% Image Based Assessment`, postcode coverage, distinct sites. (Verified: ~17,737 data rows; the
   profile fed the pre-processor.)
2. **[BUILT 2026-06-24] New offline pre-processor**
   (`dataverse/.build/sources/preprocess-eva-inspection-export.py`). The export has **no `provider_code`
   column**, so it **maps each inspection to a provider/Principal** by parsing the **`Case ID` leading
   alpha prefix** (e.g. `CCPY26050` → Principal `CCPY`; prefix length varies 2–5). **BRANCH:** a
   **VRM-shaped `Case ID`** is an **INDIVIDUAL / private-claimant case keyed by VRM — no Principal code**,
   recognised + counted in the run summary but **EXCLUDED** from the suggestion CSV. Then: drop "Image
   Based Assessment" + no-site rows, normalise postcodes (deterministic, **no network**), and **dedup to
   unique physical sites on the FULL ADDRESS** (provider + full address, with postcode as the secondary
   key), emitting `dataverse/.build/sources/inspection-suggestions-from-eva-export.csv` — the eight-column
   shape `16-seed` consumes (`provider_code, loc_value, address_index_for_loc, full_address,
   address_postcode, address_status, evidence_source, evidence_detail`) **plus** `frequency, last_seen,
   rank, case_key_kind`. Per-site **frequency + recency ranking** is carried (surfaced in the Code App
   now). **[DEFERRED]** the **#2b** proximity-ordering signal's two best-effort parser extractions
   (accident location/postcode-when-present, else claimant home-address) live in the **sibling**
   `cedocumentmapper_v2.0` + **gated** geocoding (`AZURE_MAPS_ENABLED=false`) — out of scope this turn,
   never an auto-select.
3. **[BUILT 2026-06-24] `16-seed-suggested-addresses.ps1` `-ReplaceSuggestions` mode** — defaults
   `-CsvPath` to the new CSV; every imported row is written as a SUGGESTION (`decisionMode=Unknown`,
   `sourceLabel='suggested:eva_export'`) **plus** the three ranking columns; in `-Apply` it
   deletes/regenerates only `sourceLabel startswith 'suggested'`, **keeping the confirmed-row
   protection** (probe-and-skip). **DRY-RUN is the default** (no `-Apply` ⇒ no tenant contact) and reports
   delete/keep. `17-verify-suggested-addresses.ps1` asserts the new counts + **no Case row is touched**.
   **[OPERATOR]** the live `-Apply` full-replace has **NOT** run.
4. **[BUILT 2026-06-24] Code App ranking surface** — `SuggestedAddress.frequency/lastSeen/rank` in
   `mockup-app/src/data/types.ts`, mapped by the Dataverse adapter, ordered by (rank → frequency →
   last-seen), with a "seen N times · last <date>" hint. **Ordering only — ADR-0013 unchanged.**
5. **[BUILT 2026-06-24] Reconcile the lower docs to ADR-0016** —
   `docs/architecture/inspection-address-corpus.md` (EVA-export source replaces the `codexwork`-master-CSV
   narrative; `codexwork` kept as historical provenance), `docs/requirements/inspection-address.md`, this
   plan, and the Phase-4 README.

### Pending / status
- **[DONE 2026-06-24]** the live backup (16a) + the `-Apply` `-ReplaceSuggestions` full-replace ran:
  2,035 `suggested:eva_export` live, 503 stale removed, 174 confirmed preserved, `17-verify` all-pass;
- **[DEFERRED]** the **#2b** proximity-ordering signal (sibling parser extractions + gated Azure Maps
  geocoding) — suggestion-ORDERING only, never an auto-select;
- **[PLANNED → building]** **helper #3** is re-scoped to a **live, human-confirmed location-suggestion
  assist** (not offline-only) — see [live-location-suggestion-assist.md](./live-location-suggestion-assist.md).

## Open questions

See [../../open-questions.md](../../open-questions.md) → "Phase 4a — inspection-address revamp".
