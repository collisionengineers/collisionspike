# Inspection Address

Distilled from `raw/inspection_address_helper/`. The single hardest workflow area: establishing
where the vehicle is inspected, which EVA needs as a **full address** (field 9). In live intake the
full address is usually **not in the documents** and is **worked out manually** by staff. Policy is
**prefer a real physical address; do not silently fall back to "Image Based Assessment."** Mapped to
the spike's Microsoft stack (the source docs assume Google Cloud — adapt, don't adopt).

**Authoritative pair:** [ADR-0013](../adr/0013-loc-export-artifact-no-runtime-address-matching.md)
(the decision — there is **no runtime matcher**) and
[`../architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md) (how
the suggestions are derived offline and what the CSVs are for). This page is the requirements-level
summary; those two govern.

## Policy model (per WorkProvider: `inspectionLocationPolicy`)
| Policy | Behaviour |
|---|---|
| `always_image_based` | Always use Image Based Assessment for this provider. |
| `prefer_address` | Prefer a real physical address; surface the offline-derived suggestions for a manual pick/edit, and record how the address was populated. **Default for unknown providers.** |
| `required_address` | Image Based Assessment only by **Management override** (audited). |

"Image Based Assessment" is a **deliberate, recorded reviewer decision with a reason** — never the
parser's silent default. (collisioncc's parser currently auto-fills it at confidence 0.3; the spike
must not.) The Code App `address-policy.ts` gate enforces this: EVA export is **gated** until the
address is accepted, edited, or explicitly marked image-based **with a reason**.

## How the address is established: offline suggestions + a manual pick (no runtime resolver)
There is **one** inspection-address model. The full addresses were mined **offline** from Collision
Engineers' own Box/EVA **case history**, per provider, into a master sheet. Only the rows that carry
a **real full address** are loaded (by `dataverse/.build/16-seed-suggested-addresses.ps1`) into
`cr1bd_inspectionaddress` as provider-scoped **suggestions** (`decisionMode=Unknown`,
`sourceLabel='suggested:…'`). In the Code App Address tab a staff reviewer **picks/edits** one
suggestion, or records "Image Based Assessment" with a reason. Each chosen address normalises to the
**6-line EVA address** (postcode.io normalises plain UK postcodes; `AZURE_MAPS_ENABLED=false`)
before readiness.

The corpus is the **static totality at this time** — a fixed snapshot, not a service. There is **no
runtime inspection-address matcher**: no Function, flow, or connector that takes a Case and resolves
an address on the fly. (An earlier such "assistant/resolver" was a **misread** of the EVA-export
`Loc` artifact and was removed root-and-stem on 2026-06-23 — see ADR-0013. Any richer future assist
is **more offline corpus mining**, never a runtime resolver.)

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

These are **offline inputs to the corpus build**, not runtime evidence weighed per Case. EXIF/GPS and
vision-only clues are **not** part of the live model; if ever used they belong to offline corpus
improvement, never auto-population at runtime.

## Microsoft service mapping (replacing the Google services in the source report)
| Need | Source doc (Google) | Spike (Microsoft) |
|---|---|---|
| Postcode normalisation | — | **postcode.io** for plain UK postcode validate/normalise (the live need) |
| OCR signage/paperwork (offline mining) | Cloud Vision OCR | **Azure AI Vision** Read OCR |
| Instruction/document extraction | Document AI | **Azure AI Document Intelligence** / `cedocumentmapper_v2.0` |
| Geocode / reverse-geocode / nearby business | Google Maps / Places | **Azure Maps** Search/geocoding (gated `AZURE_MAPS_ENABLED=false`) — not needed by the live model |

## When it runs
On no runtime schedule — there is no resolver to run. Staff establish the address **manually** in the
Code App Address tab, choosing from the offline-derived suggestions or recording image-based with a
reason. The suggestions are static reference data already loaded; refreshing them is an **offline
re-seed**, not a live action.

## Privacy
Location data is sensitive (may reveal claimant home). Audit address decisions, set retention, keep
any raw EXIF (offline only) out of reports, require an explicit reviewer reason for image-based
fallback, and flag when an address may be a claimant home rather than an inspection site.
