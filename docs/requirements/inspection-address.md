# Inspection Address

Distilled from `raw/inspection_address_helper/`. The single hardest workflow area: establishing
where the vehicle is inspected, which EVA needs as a **full address** (field 9). In live intake the
full address is usually **not in the documents** and is **worked out manually** by staff. Policy is
**prefer a real physical address; do not silently fall back to "Image Based Assessment."** Mapped to
the spike's Microsoft stack (the source docs assume Google Cloud — adapt, don't adopt).

**Authoritative pair:** [ADR-0013](../adr/0013-loc-export-artifact-no-runtime-address-matching.md)
(the binding decision — there is **no runtime matcher**) and
[`../architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md) (how
the suggestions are derived offline and what the source files are). The suggestion layer is regenerated
from the **2-year EVA full-address export** per
[ADR-0016](../adr/0016-inspection-address-corpus-eva-export.md) (2026-06-24; ADR-0013 re-affirmed). This
page is the requirements-level summary; those three govern.

## Policy model (per WorkProvider: `inspectionLocationPolicy`)
| Policy | Behaviour |
|---|---|
| `always_image_based` | Always use Image Based Assessment for this provider. |
| `prefer_address` | Prefer a real physical address; surface the offline-derived suggestions for a manual pick/edit, and record how the address was populated. **Default for unknown providers.** |
| `required_address` | Image Based Assessment only by **Management override** (audited). |

"Image Based Assessment" is a **deliberate, recorded reviewer decision with a reason** — never the
parser's silent default. (collisioncc's parser currently auto-fills it at confidence 0.3; the spike
must not.) The SPA `address-policy.ts` gate enforces this: EVA export is **gated** until the
address is accepted, edited, or explicitly marked image-based **with a reason**.

## How the address is established: offline-derived suggestions + a live human-confirmed pick (no auto-resolver)
There is **one** inspection-address model; the live corpus is the **Postgres `inspection_address`** table
(was the Dataverse `cr1bd_inspectionaddress` table). The full addresses are mined **offline** from Collision
Engineers' own EVA **case history**. The live source is the **2-year EVA full-address export**
(`fullevaexportinspectionaddresses.xlsx`, ~17,737 inspection rows); an offline pre-processor parses the
**provider/Principal from each `Case ID` leading alpha prefix** (VRM-shaped `Case ID`s are
**INDIVIDUAL** cases keyed by VRM and excluded), drops "Image Based Assessment" + no-site rows, and
**dedups to unique physical sites per provider on the FULL ADDRESS**. The resulting rows are loaded (by
`dataverse/.build/16-seed-suggested-addresses.ps1 -ReplaceSuggestions`, backup-first) into
`cr1bd_inspectionaddress` as provider-scoped **suggestions** (`decisionMode=Unknown`,
`sourceLabel='suggested:eva_export'`). In the SPA Address tab a staff reviewer **picks/edits** one
suggestion, or records "Image Based Assessment" with a reason. Each chosen address normalises to the
**6-line EVA address** (postcode.io normalises plain UK postcodes; `AZURE_MAPS_ENABLED=false`)
before readiness. _(The offline pipeline is built 2026-06-24; the live `-Apply` replace RAN 2026-06-24
(backup-first; 2,035 live, 503 removed, 174 preserved, `17-verify` all-pass). The prior `codexwork`
master CSV is superseded as the live source but kept for provenance.)_

**Suggestions are ranked (ordering only, ADR-0013 unchanged).** The pre-processor carries per-site
**frequency + recency** as ranking metadata (`cr1bd_suggestionfrequency` / `cr1bd_lastseenon` /
`cr1bd_suggestionrank`); the SPA **orders** suggestions by rank (then frequency, then last-seen)
and shows a "seen N times · last <date>" hint. This is **descriptive ordering, never an auto-select** —
staff still pick per case.

The **corpus** is offline-derived data — a fixed snapshot, re-seeded offline. What is forbidden is a
runtime **AUTO-resolver / matcher**: no Function, flow, or connector that takes a Case and **resolves and
applies** an address on its own. (An earlier such auto-"assistant/resolver" was a **misread** of the
EVA-export `Loc` artifact and was removed root-and-stem on 2026-06-23 — see ADR-0013.) This is **not**
"there is no live feature": per [ADR-0013](../adr/0013-loc-export-artifact-no-runtime-address-matching.md)
§Consequences a **live, gated, reviewer-invoked "Suggest location" assist** is permitted (the
`LOCATION_ASSIST_ENABLED` Function `location-suggest` → `/api/location-suggest`) — it proposes candidate
addresses from vision over the case's own photos and geocoded text clues, and the **reviewer confirms one
or records image-based**. It only ever *suggests*; it never auto-applies.

**Partials/bare postcodes are never loaded or suggested.** Rows whose `address_status` is in the
no-address set (or that hold only a part-postcode) stay in the master sheet as a
**future-investigation backlog** — resolved to a full address offline later, then re-seeded. The
live system never suggests a partial or a bare postcode. (Detail: the corpus doc's "hard split.")

## Where the suggestions come from (offline evidence — corpus quality, not a live signal fusion)
The offline mining that produced the loaded full addresses leans on, in roughly descending strength:

1. Explicit address in a provider's historical instruction/email.
2. Provider/garage **corpus** rule (known storage yard for the provider/sub-source).
3. **OCR** of signage / paperwork → exact **phone/email** match to the garage corpus, then
   postcode/business name.
4. Historical accepted address for the provider/source (repeat-postcode history is the strongest
   lever — see `task5_principal_postcode_profiles/full_postcodes_repeated.csv`).

These are **offline inputs to the corpus build**, not runtime evidence weighed for the *corpus*. Distinct
from that is the **live assist**: the gated, reviewer-invoked `location-suggest` Function **does** use
vision over the case's own photos + geocoded text clues (incl. EXIF) **at review time** — but only to
**propose candidates a human confirms**, never to auto-populate. The bright line is auto-**application**,
not whether vision/geocode runs live.

## Microsoft service mapping (replacing the Google services in the source report)
| Need | Source doc (Google) | Spike (Microsoft) |
|---|---|---|
| Postcode normalisation | — | **postcode.io** for plain UK postcode validate/normalise (the live need) |
| OCR signage/paperwork (offline mining) | Cloud Vision OCR | **Azure AI Vision** Read OCR |
| Instruction/document extraction | Document AI | **Azure AI Document Intelligence** / `cedocumentmapper_v2.0` |
| Geocode / reverse-geocode / nearby business | Google Maps / Places | **Azure Maps** Search/geocoding (gated `AZURE_MAPS_ENABLED=false`) — not needed by the live model |

## When it runs
**Live, per case, at review time.** Staff establish the address in the SPA Address tab — picking from the
ranked offline-derived suggestions, invoking the gated **"Suggest location"** assist when the corpus and
the case documents don't settle it, editing freely, or recording image-based with a reason. What is **not**
a live action is **AUTO-resolution** (the removed matcher) and **refreshing the corpus** (an offline
re-seed). So the *feature* runs live every review; only the *corpus data* is produced offline.

## Privacy
Location data is sensitive (may reveal claimant home). Audit address decisions, set retention, keep
any raw EXIF (offline only) out of reports, require an explicit reviewer reason for image-based
fallback, and flag when an address may be a claimant home rather than an inspection site.
