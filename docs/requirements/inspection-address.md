# Inspection Address Assistant

Distilled from `raw/inspection_address_helper/`. The single hardest workflow area: establishing
where the vehicle is inspected. Policy is **prefer a real physical address; do not silently fall
back to "Image Based Assessment."** Mapped to the spike's Microsoft stack (the source docs assume
Google Cloud — adapt, don't adopt). **Reference-derived; confirm in grill.**

## Policy model (per WorkProvider: `inspectionLocationPolicy`)
| Policy | Behaviour |
|---|---|
| `always_image_based` | Always use Image Based Assessment for this provider. |
| `prefer_address` | Run the assistant, autofill a physical address where possible, mark how it was populated. **Default for unknown providers.** |
| `required_address` | Image Based Assessment only by **Management override** (audited). |

"Image Based Assessment" is a **deliberate, recorded reviewer decision with a reason** — never the
parser's silent default. (collisioncc's parser currently auto-fills it at confidence 0.3; the spike
must not.)

## Ranked candidates, not a single guess
The assistant produces **ranked address candidates** with evidence, confidence, and conflicts; the
reviewer accepts / edits / asks the source / marks image-based-with-reason. EVA export is **gated**
until the address is accepted, edited, or explicitly image-based. Each candidate normalises to the
**6-line EVA address** before readiness.

## Evidence hierarchy (signal fusion)
1. Explicit address in instruction/email (highest).
2. Provider/garage **corpus** rule (known storage yard for the provider/sub-source).
3. **OCR** of signage / paperwork → exact **phone/email** match to the garage corpus (very strong),
   then postcode/business name.
4. **EXIF/GPS** when present (often stripped by WhatsApp — absence is normal, not a warning) →
   reverse-geocode + nearby-business lookup.
5. Historical accepted address for the provider/source.
6. Vision logo/landmark/web clues, and VLM/Gemini-style visual guesses — **low confidence,
   review-only, never auto-export.**

EXIF/GPS and vision-only evidence must **never auto-populate alone**. Auto-population is governed by
Provider Automation Mode (`No auto`→manual; `Review auto`→staff acknowledge; `AI Auto`/`Full auto`→
gated). Auto-filled fields always show provenance markers.

> **Spike scope (decided):** **M1** — policy gate + manual address entry (no silent image-based).
> **M2 (lean assistant)** — ranked candidates from **deterministic** signals only: instruction/email
> text, provider/garage **corpus**, **OCR** (phone/email/postcode → Repairer match), and historical
> accepted addresses; reviewer-gated. **M3** — add EXIF/GPS, **Azure Maps** geocoding/nearby-search,
> and vision clues. (Rationale: corpus + OCR are the strongest signals per the research; EXIF is
> usually stripped by WhatsApp; Azure Maps adds per-call cost.)

## Microsoft service mapping (replacing the Google services in the source report)
| Need | Source doc (Google) | Spike (Microsoft) |
|---|---|---|
| OCR signage/paperwork | Cloud Vision OCR | **Azure AI Vision** Read OCR |
| Instruction/document extraction | Document AI | **Azure AI Document Intelligence** / `cedocumentmapper_v2.0` |
| Geocode / reverse-geocode / nearby business | Google Maps / Places | **Azure Maps** Search/geocoding (gated `AZURE_MAPS_ENABLED`); postcode.io for plain postcode normalisation |
| EXIF/GPS read | exifr / exiftool | `exifr` (client) or server lib — platform-neutral |
| Visual clue summarisation | Vertex Gemini | **Azure OpenAI** (clue summary only, never the address oracle) |

## When it runs
Automatically during intake/parsing when address is missing/incomplete, **and again** in the
automation pipeline before EVA readiness. Staff get a manual **"Run address assistance"** action.
**Live AI/web search must not run on ordinary page render** (cost + latency).

## Privacy
Location data is sensitive (may reveal claimant home). Restrict raw EXIF/coords, audit address
decisions, set retention, keep raw EXIF out of reports, require explicit reviewer reason for
image-based fallback, and flag when an address may be a claimant home rather than an inspection site.
