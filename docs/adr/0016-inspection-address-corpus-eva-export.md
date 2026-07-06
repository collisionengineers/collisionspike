# ADR-0016 — Inspection-address suggestion corpus regenerated from the 2-year EVA full-address export

**Status:** Proposed (2026-06-24); **Realised 2026-07-06** (TKT-075…080). **ADR-0013 remains binding and
is re-affirmed.** Relates to ADR-0017 (data governance). Realised in Phase 4a.

> **Realised 2026-07-06 (TKT-075/076/077/078/079/080).** The offline pre-processor is now the
> reproducible in-repo `scripts/inspection-corpus/` pipeline with the corrected **marker-aware** provider
> parse (the naive parse scattered the ~4,673 `a.`/`ap.`-marked Case IDs, e.g. `a.qdos…`→"A" instead of
> QDOS); the suggested layer was **reseeded live**, backup-first, with Confirmed rows preserved
> byte-identical. Helper #2b **proximity** is built as ordering-only (nearest-first via Azure Maps, never
> auto-selects). Helper #3 **vision assist** now reads the case's real photos; its AI vision-reasoning
> **escalation** ships DARK (`LOCATION_ASSIST_AI_ENABLED`, operator sign-off before flip). `always_image_based`
> stays **operator-designated** — the pipeline only reports image-based % per provider, never sets policy.
> Detail: [inspection-address-corpus.md](../architecture/inspection-address-corpus.md).

## Context

A new EVA export `fullevaexportinspectionaddresses.xlsx` (**~17,737 inspection rows**) has arrived with
columns *Case ID, Vehicle Reg, Insured Name, Claim No, Created Date, InspLocAdd, InspLocPCode,
InspLocName, InspLocCont, InspLocAdd1* — i.e. the **FULL street / postcode / site-name**, much richer
than the prior `codexwork` CSV that yielded only ~697 rows of suggestions.

The operator says it "**is now the source of truth and to entirely replace the current records**", and
lists three helper methods to consider: (1) provider-always-image-based autofill; (2) most-common /
closest-to-accident; (3) vision-AI / geolocate.

## Decision

Adopt the export to **FULLY REPLACE** the SUGGESTION layer of `cr1bd_inspectionaddress`. Every
imported row is a **SUGGESTION** (`decisionMode=Unknown`), so **ADR-0013 REMAINS BINDING and is
re-affirmed** — there is **NO runtime inspection-address matcher**, nothing auto-confirms, and staff
still pick per case. All helper signals bind to the **OFFLINE corpus-build layer** or to
**suggestion-ORDERING**, never to a per-Case runtime resolver.

- **Full replace, backup-first.** The export "**is now the source of truth and is to entirely replace
  the current records**". Before regenerating, **back up the current corpus to the repo first**, then
  rebuild the suggestion layer from the export. (See *Consequences* for the preserve/replace mechanics.)
- **Provider / Principal is parsed from the export's `Case ID`** — the **leading alpha prefix** is the
  Principal code (e.g. `CCPY26050` → `CCPY`). **BRANCH:** if the `Case ID` is **VRM-shaped**, the row is
  an **INDIVIDUAL / private-claimant case keyed by VRM** (no Principal code). This replaces the earlier
  "no `provider_code` column → map via Claim No / Insured Name" guesswork.
- **Dedup sites on the FULL ADDRESS** — `(provider + full address)`, with **postcode as a secondary**
  key — not postcode alone.
- **Helper #1 (provider-always-image-based)** = a per-provider **SUGGESTED default surfaced for operator
  confirmation, NEVER auto-applied** and subject to the no-silent-image-based rule (`address-policy.ts`).
  It is **OPERATOR-DESIGNATED for specific providers only** — it is **NOT statistically derived** from
  the export (a high image-based % there usually signals **missing data**, not a deliberate policy).
- **Helper #2 (frequency + recency ranking)** = **implemented NOW** as offline-derived ranking metadata
  and **surfaced in the Code App now** (not deferred to M2).
- **Helper #2b ("closest to accident") is ADOPTED as a future suggestion-ORDERING signal — DEFERRED
  this turn** (it **replaces the earlier "closest to accident is DROPPED" verdict**, but is **not built**;
  the pre-processor emits frequency + recency only). It will be **never an auto-select**, so ADR-0013 is
  **not reopened**. It would use an **accident location/postcode WHEN PRESENT in the instruction** (formats
  vary — an opportunistic, best-effort parse), else fall back to **CLAIMANT HOME-ADDRESS proximity** (a
  *soft* signal — the claimant may have been travelling, so it is not a guarantee). It needs two best-effort
  parser extractions (accident location, claimant home address; **sibling** `cedocumentmapper_v2.0`) plus
  **gated** geocoding (`AZURE_MAPS_ENABLED=false`) — see the *Implementation note* below.
- **Helper #3 (vision / geocode)** = **re-scoped (2026-06-24) to a LIVE, reviewer-invoked
  location-suggestion ASSIST** for cases the corpus + documents can't place: vision over the case's own
  photos + Azure Maps geocoding of text clues (accident location, claimant address) → **candidate
  suggestions a reviewer confirms** (or "Image Based Assessment" with a reason). **Human-in-the-loop;
  nothing auto-applies** — permitted under the
  [ADR-0013](0013-loc-export-artifact-no-runtime-address-matching.md) 2026-06-24 scope clarification (live
  human-confirmed suggestions allowed; only runtime AUTO-resolution forbidden). Gated
  (`cr1bd_LOCATION_ASSIST_ENABLED`, default off). **Supersedes the earlier "offline mining only" framing.**
  Detail + the deferred GPT-4o escalation:
  [live-location-suggestion-assist.md](../plans/phase-4-address-and-chaser/live-location-suggestion-assist.md),
  [gpt4o-reasoning-escalation.md](../plans/phase-4-address-and-chaser/gpt4o-reasoning-escalation.md).

## Consequences

A **NEW offline pre-processor** must:

1. **back up the current `cr1bd_inspectionaddress` corpus to the repo** (pre-step, before any replace);
2. profile the `.xlsx`;
3. parse provider / Principal from the **`Case ID` leading alpha prefix**, branching VRM-shaped
   `Case ID`s to **VRM-keyed individual** rows (no Principal code);
4. drop "Image Based Assessment" rows;
5. normalise postcodes (postcode.io);
6. **dedup ~17,737 inspections to unique physical sites per provider on the FULL ADDRESS** (postcode
   secondary), emitting the 8-column shape `16-seed-suggested-addresses.ps1` consumes;
7. compute **frequency + recency** ranking metadata (surfaced in the Code App), and the **gated
   proximity-ordering** signal (accident-loc-when-present, else claimant-home proximity).

Add a **`-ReplaceSuggestions` mode** that regenerates only `sourceLabel startswith 'suggested'` and
**PRESERVES the hand-curated Confirmed rows** (a full truncate happens only on explicit operator
confirmation, and only after the repo backup above).

Every imported row remains a **suggestion** (`decisionMode=Unknown`): staff still pick/edit per case
and nothing auto-confirms — **ADR-0013 stays intact**.

## Implementation note (2026-06-24)

The **offline pipeline is BUILT** (still **gated-OFF / DRY-RUN by default**; Status stays **Proposed** —
flipping to Accepted is the operator's review call):

- the three additive nullable schema columns on `cr1bd_inspectionaddress`
  (`cr1bd_suggestionfrequency`, `cr1bd_lastseenon`, `cr1bd_suggestionrank`);
- the **pre-processor** `dataverse/.build/sources/preprocess-eva-inspection-export.py` — provider from
  the `Case ID` leading-alpha prefix, the **VRM-individual** exclusion branch (counted in the run
  summary), drop image-based + no-site rows, deterministic postcode normalisation, full-address dedup,
  and the frequency/recency/rank metadata — emitting
  `dataverse/.build/sources/inspection-suggestions-from-eva-export.csv`;
- the **`16-seed -ReplaceSuggestions` seed** (DRY-RUN default; writes `suggested:eva_export` +
  `decisionMode=Unknown` + the new ranking columns; preserves Confirmed rows) and the **repo backup**
  pre-step (16a);
- the **Code App ranking surface** (`SuggestedAddress.frequency/lastSeen/rank`, ordered by
  rank→frequency→last-seen, "seen N times · last <date>" hint) — **ordering only, ADR-0013 unchanged**.

**Status update (2026-06-24):** the **live `-Apply` replace was RUN** — backup via 16a first, then
`16-seed -ReplaceSuggestions -Apply`: **2,035 `suggested:eva_export` rows live, 503 stale suggestions
removed, the confirmed rows preserved (174 at the 2026-06-24 load — live count in the [registry](../architecture/live-environment.md)); `17-verify` all-pass** (and the 3 ranking columns created live).
**Still PENDING:** the **#2b proximity-ordering** signal — two best-effort parser extractions (accident
location, claimant home address; **sibling** `cedocumentmapper_v2.0`) + **gated** geocoding — is
**deferred**; and **helper #3 is re-scoped** to a LIVE, human-confirmed location-suggestion assist
(BUILT OFFLINE, GATED-OFF 2026-06-24 — Function + connector + Code App, tests green; activation pending
the operator — see the plan docs), **not** offline-only. None of the pending items reopen ADR-0013.

## Links

- ADR-0013 (re-affirmed — no runtime address matcher; suggestion-ORDERING is permitted)
- [`docs/architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md)
- ADR-0017 (data retention, erasure & PII lifecycle)
- Phase 4a plan — [`docs/plans/phase-4-address-and-chaser/inspection-address-revamp.md`](../plans/phase-4-address-and-chaser/inspection-address-revamp.md)
