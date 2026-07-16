# Inspection Address Assistant — Research and Implementation Report

**Client/project:** Collision Engineers / Collision Command Centre  
**Focus area:** Inspection Address  
**Prepared:** 2026-06-01  
**Output:** Markdown report

---

## 1. Executive conclusion

Collision Engineers should implement an **Inspection Address Assistant**, not a fully autonomous “image geolocation” feature. The assistant should generate **ranked address candidates** from multiple evidence signals, show the evidence to the admin user, and only allow the EVA export when the address has either been accepted, edited, or deliberately marked as “Image Based Assessment” with a reason.

The strongest approach is a **signal-fusion workflow**:

1. First prefer explicit addresses from the instruction, email body, attachments, or existing case data.
2. Then use the known provider/garage corpus already present in the job sheet, especially the `Principals` and `Garages` sheets.
3. Then use image-derived evidence: EXIF GPS metadata, OCR on signage/number plates/garage signs, phone numbers, email addresses, postcodes, road names, and business names.
4. Then validate candidate addresses through Google Maps Platform: Geocoding, reverse geocoding, Places Text Search, and Nearby Search.
5. Use Google Cloud Vision and Vertex AI Gemini only as supporting evidence, not as an unverified single source of truth.
6. Keep a human-review and feedback loop so that domain knowledge becomes structured data rather than remaining only in staff memory.

This matches the clarified operational requirement: **do not default to image-based inspection where a proper address can reasonably be established.**

---

## 2. Current process and project findings

### 2.1 Existing systems and workflow

The current administrative process spans EVA, Box, Audatex, Excel, Outlook, WhatsApp, and manual handoffs. The CollisionCC README describes the new system as a planned replacement or coordination layer for workflows currently spread across EVA, Box, Outlook, Excel/job sheets, Audatex, WhatsApp, and manual handoffs.[^collision-readme] The admin overview says the current core systems are EVA, Box, Audatex, and Excel, with Outlook email, WhatsApp, and Audatex API as intake channels.[^admin-systems]

The same overview explains that a case can proceed to EVA when the required documents and images are available; if images are missing, staff may need to contact the provider or garage.[^admin-ready] Where images arrive without instructions, they are stored by vehicle registration on a shared network drive.[^admin-images-no-instruction] The files needed to add to EVA include a saved email, vehicle images, valuation evidence, and the initial instruction.[^admin-required-files]

Inspection Address is explicitly identified as a difficult workflow area: the vehicle is usually inspected at a garage or similar address, but the source may be an email, other case data, admin domain knowledge, or, where unclear, “Image Based Assessment.”[^admin-inspection-address] The user has since clarified that the intended policy is now stricter: **prefer a correct physical address wherever possible and avoid image-based inspection on reports unless it genuinely cannot be established.**

### 2.2 Current code status in CollisionCC

The public repository is already set up for a Google Cloud architecture. The README states the intended direction is a Google Cloud platform using a web app/backend on Google Cloud, Google Cloud AI services, Firebase, and related services.[^collision-readme-cloud] The developer architecture guide lists Next.js, Firebase App Hosting, Cloud Run fallback, Firestore, Cloud Storage, Secret Manager, Document AI, Microsoft Graph, EVA POST API, and deferred Box/WhatsApp integration.[^architecture-stack]

The current source model is already compatible with an evidence-driven address assistant. `EvidenceFile` metadata includes fields such as `gcsPath`, `imageRole`, `registrationVisible`, and `acceptedForEva`, and extracted fields already have `confidence`, `source`, `sourceText`, and `warnings` fields.[^domain-types] This is a good foundation for adding address candidates and source evidence.

The current parser has explicit label patterns for `inspectionAddress`, including `INSPECTION ADDRESS`, `VEHICLE LOCATION`, `ADDRESS`, and `LOCATION`.[^parser-labels] However, when no address is found, the parser currently creates a fallback extracted field with value `Image Based Assessment`, confidence `0.3`, and source `deterministic`.[^parser-fallback] That behavior should be changed. Under the clarified requirement, “Image Based Assessment” should be a **reviewed fallback**, not the default parser answer.

The EVA export code maps the 13 EVA fields, including `Inspection Address`, into the JSON payload.[^eva-export-fields] At present, export validation only blocks missing `VRM` and `Work Provider`; it does not gate on inspection address quality or proof.[^eva-export-validation] This should be revised so that Inspection Address is either confirmed, edited, or deliberately marked as image-based with an audit reason.

### 2.3 Existing provider/garage corpus

The most useful current corpus is not `Mapped Principals.xlsx` by itself. That workbook is primarily a principal-code list. The richer address corpus is in `Backup of CE Job Sheet 260429.xlsm`, especially:

- `Garages!A1:F40`: approximately 38 garage records, with garage name, address, email, phone, and “figures” status.
- `Principals!B2:K60`: provider/principal guidance, including image source, EVA handling, and address rules.
- `Jobs!A1:AE226`: historical case notes, including unstructured address clues such as “Images at M12 4AH,” “Images at M12 5FX,” “on Audatex,” and provider-specific notes.[^job-sheet]

Examples from the garage sheet include garages with directly usable addresses such as Assured Accident Repair Centre in Cumbernauld, Autospray Car Body Repair Services in Northampton, Balmoral Auto Repairs in Dumfries, and Mega Crash Repairs in London.[^job-sheet] The principal sheet contains higher-level rules such as:

- Some providers or sub-sources regularly use fixed storage yards or garages.
- Some providers require confirmation from whoever sent the images.
- Some sources are usually image-based, but this should now be reviewed against the new policy.
- Some named providers have known storage locations, e.g. Berkstone Motors, Somstar Recovery and Storage, HS Recovery & Storage, Parkers Autobodies, Claim Specialists, Accident Specialist storage, or other repeated locations.[^job-sheet]

This corpus is immediately useful. It should be converted into structured tables and treated as the first version of the address knowledge base.

---

## 3. Proposed product behavior

### 3.1 Replace “single output” with “ranked candidates”

The tool should not try to answer “what is the address?” as a single blind prediction. It should answer:

> “Here are the most likely inspection addresses, with evidence and confidence. Please accept, edit, or reject.”

Each candidate should have:

- normalized six-line EVA-compatible address;
- location name;
- postcode;
- confidence score;
- source signals;
- evidence snippets;
- linked image/document/email evidence;
- conflict flags;
- reviewer decision;
- audit trail.

### 3.2 Suggested UI behavior

On the review screen, add an **Inspection Address Candidates** panel near the detected fields:

| UI element | Purpose |
|---|---|
| Candidate cards | Show top 3–5 candidate addresses. |
| Evidence chips | Examples: `Provider rule`, `Garage corpus`, `EXIF GPS`, `OCR phone`, `OCR postcode`, `Places match`, `Historical jobs`. |
| Confidence label | High / Medium / Low, with numeric score in tooltip. |
| Evidence preview | Show source image crop, OCR snippet, email snippet, or principal-rule text. |
| Actions | `Accept`, `Edit`, `Reject`, `Ask provider/garage`, `Use Image Based Assessment`. |
| Export gate | Prevent export unless accepted/edited or marked image-based with reason. |

This aligns with the existing review-screen direction in the repo: the planned admin screen should show extracted fields with confidence/source/snippet, missing checklist, duplicate markers, EVA payload preview, and reviewer actions.[^review-screen]

---

## 4. Evidence signals and how to use them

### 4.1 Signal hierarchy

The assistant should score evidence roughly in this order:

| Rank | Signal | Typical reliability | Notes |
|---:|---|---|---|
| 1 | Explicit address in instruction/email | High | Best if paired with postcode and provider context. |
| 2 | Known provider-to-garage rule | Medium to high | Should be strengthened by history or image evidence. |
| 3 | Exact garage phone/email match from OCR | High | Very useful if signage or estimate paperwork is visible. |
| 4 | EXIF GPS near known garage or Places result | High if present | Must account for GPS accuracy and stripped metadata. |
| 5 | OCR postcode + business name / road | Medium to high | Validate with Places/Geocoding. |
| 6 | Historical accepted address for same provider/source | Medium | Stronger when repeated recently and no conflicts. |
| 7 | Vision logo/object/landmark/web detection | Low to medium | Useful clues, not enough alone. |
| 8 | Visual-only VLM guess | Low | Review-only. Never export without corroboration. |
| 9 | No useful signal | N/A | Ask for confirmation or deliberately use Image Based Assessment with reason. |

### 4.2 EXIF GPS metadata

Images may contain EXIF GPS coordinates, capture time, device model, and related metadata. EXIF GPS extraction is technically straightforward with libraries such as `exifr` or `exiftool-vendored`; `exifr` specifically supports EXIF/GPS parsing in browser and Node.js and can return GPS latitude/longitude directly.[^exifr] `exiftool-vendored` provides Node.js access to ExifTool and demonstrates reading `GPSLatitude` and `GPSLongitude` from image metadata.[^exiftool-vendored]

Academic and forensic literature supports the feasibility of extracting geolocation data from smartphone images, but it also shows that accuracy and availability vary. A 2024 paper on smartphone geotagging accuracy found that accuracy depends on the measurement location and should not be generalized too broadly.[^geotagging-accuracy] Other work describes extracting GPS EXIF geotags from smartphone photos and converting them into coordinate/address workflows.[^automatic-geotagging] Sider Scholar results also found recent work on extracting geolocation data from Android smartphone photos through EXIF metadata and validating the coordinates.[^sider-exif-results]

For this workflow, EXIF should be treated as a **high-value signal when present**, but not an expected signal. Images may pass through email systems, WhatsApp, compression tools, Audatex, or downloads that remove or alter metadata. Therefore the processor should record:

```json
{
  "exifPresent": true,
  "gpsPresent": true,
  "lat": 53.472,
  "lng": -2.238,
  "captureTime": "2026-04-12T10:31:00Z",
  "deviceModel": "iPhone 14",
  "confidenceImpact": "+0.25",
  "warnings": []
}
```

If EXIF GPS is present, perform reverse geocoding and nearby-place lookup. Google’s Geocoding API supports both geocoding and reverse geocoding: it can convert addresses into coordinates, or coordinates/place IDs into addresses.[^geocoding-overview] Google’s reverse geocoding documentation explicitly notes that reverse geocoding is an estimate and attempts to find the closest addressable location within a tolerance.[^reverse-geocoding] This is why the tool should not blindly export the reverse-geocoded address; it should compare the coordinates to known garages and nearby Places candidates.

### 4.3 OCR on vehicle images

OCR is likely the most practical image-based signal. Google Cloud Vision supports `TEXT_DETECTION` for extracting text from images, including photographs with street signs or traffic signs, and `DOCUMENT_TEXT_DETECTION` for dense text/document-style images.[^vision-ocr] The Vision features list describes text detection, document text detection, landmark detection, logo detection, label detection, object localization, and web detection.[^vision-features]

OCR should run on:

- full images;
- cropped signage areas;
- images containing garage premises;
- images that look like estimates, invoices, job cards, dashboard shots, paper documents, or gate signs;
- video frames where videos are used.

Extract and normalize:

- UK postcodes;
- phone numbers;
- email addresses;
- garage/business names;
- road names;
- town/city names;
- URLs;
- visible logos.

High-value OCR matches:

| OCR item | Match target | Confidence impact |
|---|---|---:|
| Phone number | Garage corpus phone column | Very high |
| Email address | Garage corpus email column | Very high |
| Postcode | Garage corpus / Places / Geocoding | High |
| Garage name | Garage corpus / Places Text Search | High if fuzzy match strong |
| Road name | Provider rules / Places / Geocoding | Medium |
| Sign/logo only | Vision logo / web detection | Low to medium |

Phone and email matching should be deterministic. For example, OCR text containing a garage phone number should be normalized by removing spaces, punctuation, and optional country prefix, then matched to the garage corpus. This is more reliable than asking a vision model to infer a location visually.

### 4.4 Google Cloud Vision: labels, logos, landmarks, objects, and web detection

Google Cloud Vision has useful features beyond OCR:

- **Logo detection** detects popular product logos within images.[^vision-logo]
- **Landmark detection** detects popular natural and human-made structures and can return coordinates.[^vision-landmark]
- **Object localization** identifies multiple objects in an image and returns position/bounds for each object.[^vision-object]
- **Web detection** detects web references to an image and returns entities, matching/partial images, pages with matching images, visually similar images, and a best-guess label.[^vision-web]

In the inspection-address workflow:

- Logo detection may identify brands or garage signs.
- Landmark detection may occasionally help if a distinctive landmark is visible, but most garage-yard photos will not contain famous landmarks.
- Object localization helps classify the image context, e.g. garage, sign, vehicle, tyre, door, building, but does not normally produce an address.
- Web detection may help if a business sign or distinctive garage image is already indexed online, but it should be treated as a clue, not proof.

### 4.5 Document AI for instructions and embedded document images

Document AI is already aligned with the project stack. The package file includes `@google-cloud/documentai`, and the architecture guide identifies Document AI as part of the planned stack.[^package-google][^architecture-stack] Google’s Document AI overview says it transforms unstructured document data into structured fields and supports OCR, layout, key-value pair extraction, tables, classification, splitting, and integration with Cloud Storage/BigQuery.[^document-ai-overview] Enterprise Document OCR can extract text and layout information from PDFs and images, detect blocks/paragraphs/lines/words/symbols, and supports common formats including PDF, JPEG, PNG, BMP, TIFF, GIF, and WebP.[^document-ai-ocr]

Use Document AI primarily for:

- instruction PDFs;
- scanned attachments;
- estimates/invoices/job sheets embedded in emails;
- dense document images;
- layout-aware extraction where regular OCR is not enough.

Use Vision OCR primarily for natural photographs where signage or phone numbers may be visible.

### 4.6 Google Maps Platform validation

Once a candidate name/address/postcode/coordinate is extracted, use Google Maps Platform to validate and enrich it.

Recommended calls:

| API | Use |
|---|---|
| Geocoding API | Convert known/parsed address into coordinates and canonical components. |
| Reverse Geocoding | Convert EXIF coordinates into possible human-readable addresses. |
| Places Text Search | Search for OCR/business strings such as “Mega Crash Repairs E4 8DJ”. |
| Nearby Search | Given EXIF GPS, find nearby vehicle repair/body shop/storage businesses. |

Google Places Text Search returns places based on text strings and location bias, and responses contain an array of place objects.[^places-text] Nearby Search takes place types and returns matching places within a specified area; field masks control returned fields and cost.[^places-nearby] For production, request only necessary fields such as `displayName`, `formattedAddress`, `location`, `nationalPhoneNumber`, `websiteUri`, and `types`.

### 4.7 Vertex AI Gemini / visual AI

Vertex AI Gemini can be used for image-understanding tasks where deterministic services are insufficient. Google’s image-understanding documentation says Gemini requests can include images, and it lists supported image formats and limits.[^gemini-image-understanding]

However, Gemini should not be used as the only evidence for an address. Google’s own documentation states that multimodal Gemini models are not precise at locating text or objects in images and may only return approximate counts/locations.[^gemini-limitations] That limitation is directly relevant here: an approximate visual guess is not a safe basis for a formal inspection address.

Recommended Gemini use:

- Ask the model to summarize visible clues: “What business names, road signs, phone numbers, or postcodes are visible?”
- Ask it to identify whether the image appears to be at a garage, storage yard, residential address, street, or unknown.
- Ask it to compare cropped signage against a small set of pre-generated candidate names from deterministic matching.
- Do not ask it to produce a final address from visual appearance alone.

---

## 5. Review of the user’s ideas

### Idea 1 — “Certain work providers use certain garages”

This is correct and should be formalized immediately. The `Principals` sheet already contains provider-specific address rules and repeated storage/garage relationships.[^job-sheet] This should become structured configuration, not informal admin memory.

Suggested structure:

```ts
type ProviderAddressRule = {
  providerCode: string;
  sourceName?: string;          // e.g. "Sixways", "Accident Specialist", "Hackney Solutions"
  candidateAddressId: string;
  conditionText?: string;       // human-readable rule
  confidenceBase: number;       // e.g. 0.65
  requiresCorroboration: boolean;
  lastReviewedAt: string;
};
```

Provider rules should be treated as candidate generators, not automatic export decisions, unless they have a very high historical success rate and no conflicting evidence.

### Idea 2 — “Admin may look at an image and recognize a garage”

Correct. This should become a feedback loop:

1. Admin selects “Recognised garage” and chooses the garage.
2. System stores the image evidence and accepted address.
3. Future cases from the same provider/source can rank that garage higher.
4. If a similar OCR/EXIF/source pattern appears later, the system proposes the same garage.

Do not try to replicate human visual recognition entirely at first. Start by capturing the decision and making it reusable.

### Idea 3 — “Extract location data from images”

Correct but uneven. The useful categories are:

- EXIF GPS coordinates if present;
- capture timestamps and device information as supporting evidence;
- OCR text visible in the image;
- derived clues from signage and road names.

EXIF GPS can be precise enough to be very valuable, but it may be missing. It also carries privacy risk. Location privacy research emphasizes that location data can reveal sensitive information such as home, workplace, and other personal preferences/locations.[^location-privacy] Store only what is needed, restrict access, and avoid exposing raw metadata in reports.

### Idea 4 — “OCR might glean a phone number or road name”

This is one of the strongest ideas. A phone number or email address matched to the garage corpus is often better evidence than general image-location inference. The proposed design gives phone/email/postcode matches high weight and links them to the source image crop.

### Idea 5 — “Vision AI may assist with locating the image”

Correct, but only as a support layer. Vision APIs can extract text, logos, objects, landmarks, and web-related clues, but a visual-only address should be low-confidence. Gemini can summarize visible clues, but should not be the source of record for the final EVA address.

---

## 6. Recommended implementation design

### 6.1 High-level architecture

```text
Image / email / instruction uploaded
        |
        v
Cloud Storage: original files
        |
        v
Address Evidence Processor (Cloud Run / background worker)
        |
        +--> Document/email extraction
        +--> Provider/principal rule lookup
        +--> EXIF extraction
        +--> Vision OCR
        +--> Vision logo/object/landmark/web clues
        +--> Maps Geocoding / Places validation
        +--> Historical accepted address lookup
        |
        v
Candidate scoring + conflict detection
        |
        v
Firestore: case.inspectionAddressCandidates[]
        |
        v
Review UI: accept / edit / ask / image-based with reason
        |
        v
EVA export gate
```

### 6.2 Data model

Add a candidate model rather than overloading a single extracted field:

```ts
type InspectionAddressCandidate = {
  id: string;
  caseId: string;

  label: string;                 // e.g. "Mega Crash Repairs"
  addressLines: string[];        // normalized for EVA
  postcode?: string;
  lat?: number;
  lng?: number;

  confidence: number;            // 0.0 - 1.0
  confidenceBand: "high" | "medium" | "low";
  status: "suggested" | "accepted" | "rejected" | "edited" | "needs_confirmation";

  sourceSignals: AddressSignal[];
  conflicts: AddressConflict[];
  warnings: string[];

  createdAt: string;
  acceptedBy?: string;
  acceptedAt?: string;
};

type AddressSignal = {
  type:
    | "instruction_text"
    | "email_text"
    | "provider_rule"
    | "garage_corpus"
    | "historical_case"
    | "exif_gps"
    | "vision_ocr"
    | "vision_logo"
    | "vision_landmark"
    | "vision_web"
    | "places_text_search"
    | "places_nearby"
    | "manual";

  value: string;
  normalizedValue?: string;
  confidenceDelta: number;

  evidenceFileId?: string;
  sourceText?: string;
  imageCropGcsPath?: string;
  providerRuleId?: string;
  garageId?: string;
  placeId?: string;
};
```

Extend `ExtractedField.source` or add a parallel field so that `inspectionAddress` can reference an accepted candidate. The existing `ExtractedField` object already has `value`, `confidence`, `source`, `sourceText`, and `warnings`, which is compatible with this.[^domain-types]

### 6.3 New modules

Suggested module layout:

```text
src/services/inspection-address/
  address-assistant.ts        // orchestrator
  provider-rules.ts           // principal/provider rule matching
  garage-index.ts             // garage corpus normalization + lookup
  exif-extractor.ts           // exifr or exiftool-vendored
  image-ocr.ts                // Cloud Vision OCR
  image-clues.ts              // logos, objects, landmarks, web detection
  places.ts                   // Maps Geocoding / Places wrappers
  candidate-scoring.ts        // score and conflicts
  candidate-types.ts          // TS types
  candidate-store.ts          // Firestore persistence
```

### 6.4 Scoring model

Initial scoring can be deterministic and explainable:

| Evidence | Score delta |
|---|---:|
| Explicit instruction/email address with postcode | +0.55 |
| Address matches provider rule | +0.20 |
| Garage corpus exact phone/email match | +0.45 |
| Garage corpus exact postcode match | +0.25 |
| OCR business name fuzzy match | +0.20 |
| EXIF GPS within 50 m of garage/Places result | +0.40 |
| Places Text Search confirms same name + postcode | +0.30 |
| Historical accepted address for provider/source | +0.15 |
| Vision logo/landmark/web clue | +0.05 to +0.15 |
| Conflicting postcode/signals | −0.30 |
| Address appears residential where provider rule expects storage | −0.10 |
| Only visual clue, no text/GPS/history | cap at 0.55 |

Example export policy:

| Condition | Action |
|---|---|
| Candidate ≥ 0.90 and no conflicts | Preselect; user can accept quickly. |
| Candidate 0.70–0.89 | Show as likely; require user confirmation. |
| Candidate 0.40–0.69 | Show as weak; require review/edit/chaser. |
| No candidate ≥ 0.40 | Recommend asking sender/garage or deliberate image-based fallback. |
| Conflicting high-confidence candidates | Block export until resolved. |

### 6.5 Avoiding premature “Image Based Assessment”

Change parser behavior:

Current behavior:
```ts
if (!result.inspectionAddress?.value) {
  result.inspectionAddress = {
    value: "Image Based Assessment",
    confidence: 0.3,
    source: "deterministic"
  };
}
```

Recommended behavior:
```ts
if (!result.inspectionAddress?.value) {
  result.inspectionAddress = {
    value: "",
    confidence: 0,
    source: "unknown",
    warnings: ["No confirmed inspection address. Address assistant review required."]
  };
}
```

Then generate candidates separately. “Image Based Assessment” should be a reviewer decision:

```ts
case.inspectionAddressDecision = {
  mode: "image_based_assessment",
  reason: "No address in instruction, no EXIF GPS, OCR produced no garage/address clues, provider did not confirm.",
  decidedBy: currentUser.id,
  decidedAt: new Date().toISOString()
};
```

---

## 7. Google Cloud service mapping

| Requirement | Google service / component | Notes |
|---|---|---|
| Store original images and derived crops | Cloud Storage | Existing architecture already points to Cloud Storage.[^architecture-stack] |
| Store candidates, evidence, decisions | Firestore | Existing architecture identifies Firestore as source of truth.[^architecture-data] |
| Run image processing | Cloud Run background worker or Cloud Functions | Use async queue for large batches. |
| Parse instructions and dense documents | Document AI Enterprise OCR | Best for PDF/scanned/document images. |
| OCR natural photos | Cloud Vision API `TEXT_DETECTION` | Best for signage/phone/road/postcode in photos. |
| Logo/object/landmark/web clues | Cloud Vision API | Supporting evidence only. |
| Multimodal clue summarization | Vertex AI Gemini | Do not use as direct address oracle. |
| Geocode/reverse geocode | Google Maps Geocoding API | Validate coordinates/address components. |
| Business lookup | Places Text Search / Nearby Search | Match garage names, phones, addresses, nearby vehicle repair places. |
| Secret storage | Secret Manager | Store Maps API key and any external credentials. |

---

## 8. Public repository / library findings

| Repository | Use | Recommendation |
|---|---|---|
| `MikeKovarik/exifr` | JS EXIF/GPS parsing in browser/Node. It supports JPEG/TIFF/PNG/HEIC and converts GPS DMS to decimal latitude/longitude.[^exifr] | Good first choice if files are JPEG/PNG/HEIC and metadata read-only is enough. |
| `photostructure/exiftool-vendored.js` | Node.js wrapper for ExifTool; reads metadata including GPS fields and is cross-platform.[^exiftool-vendored] | More robust server-side option; heavier but likely better for varied image formats. |
| `openvenues/libpostal` | Statistical NLP for parsing/normalizing street addresses; useful preprocessing for fuzzy address matching.[^libpostal] | Consider for address normalization if deployment constraints are acceptable. |
| `googleapis/google-cloud-node/packages/google-cloud-vision` | Official Google Cloud Vision Node.js client. README says install via `npm install @google-cloud/vision` and includes samples.[^node-vision] | Use for Vision OCR/logo/object/landmark/web calls. |
| `googleapis/google-cloud-node/packages/google-cloud-documentai` | Official Google Document AI Node.js client. README says install via `npm install @google-cloud/documentai` and includes processor samples.[^node-documentai] | Already aligned with repo dependency. |
| `googlemaps/google-maps-services-js` | Google Maps Services Node.js client; supports Geocoding API and other server-side Maps APIs.[^maps-node-client] | Useful for Geocoding API; for Places New APIs, use current `@googlemaps/places` or REST where needed. |

The official Google Maps client README notes that newer Google Maps APIs each provide their own npm package, including `@googlemaps/places` and `@googlemaps/addressvalidation`.[^maps-node-client] For new Places API usage, use the current package/REST pattern, not only legacy Places methods.

---

## 9. Suggested rollout plan

### Phase 0 — Normalize existing data

1. Import `Garages` sheet into a canonical `garages` collection.
2. Import `Principals` sheet into a `providerAddressRules` collection.
3. Normalize:
   - provider code;
   - garage name;
   - postcode;
   - phone numbers;
   - emails;
   - address lines;
   - aliases.
4. Do not expose phone/email in UI unless required; use them for matching.

Deliverable: structured address corpus and review UI showing provider rules.

### Phase 1 — Deterministic candidates

1. Parse instruction/email for address labels and postcodes.
2. Apply provider rules.
3. Search historical accepted addresses by provider/source.
4. Remove automatic image-based fallback.
5. Add export gating.

Deliverable: immediate improvement without any AI/image processing.

### Phase 2 — EXIF GPS + Maps

1. Extract EXIF from uploaded images.
2. Reverse geocode GPS coordinates.
3. Use Nearby Search around GPS to find body shops/storage/garages.
4. Compare to garage corpus.
5. Add confidence scoring and evidence display.

Deliverable: high-confidence GPS candidates when metadata exists.

### Phase 3 — OCR on images

1. Run Vision OCR on images.
2. Extract phone/email/postcode/garage names/road names.
3. Match to garage corpus and Places Text Search.
4. Store OCR snippets and crop evidence.

Deliverable: practical address discovery when signage or paperwork is visible.

### Phase 4 — Vision/Gemini clues

1. Run Vision logo/object/landmark/web detection.
2. Add Gemini clue summarization for difficult images.
3. Keep all outputs capped as low/medium evidence unless corroborated.

Deliverable: better hints for ambiguous cases, still human-controlled.

### Phase 5 — Feedback loop and quality metrics

Track:

- number of cases where candidate was accepted unchanged;
- edited candidate rate;
- chaser rate;
- image-based fallback rate;
- false positive rate;
- provider-specific address rules with high success;
- OCR/EXIF hit rates by image source.

The goal should be reducing unnecessary “Image Based Assessment” without increasing incorrect physical addresses.

---

## 10. Privacy, audit, and safety requirements

Location data is sensitive. The location privacy survey by Primault et al. explains that location data can reveal sensitive information such as home, workplace, religious, and political preferences.[^location-privacy] For Collision Engineers, this matters because vehicle images may contain client homes, workplaces, storage yards, and personal data.

Implement:

- restricted access to raw EXIF and image-derived coordinates;
- audit logs for address decisions;
- retention rules for raw metadata;
- no raw EXIF data in reports;
- no automatic publication of inferred home addresses without human review;
- visible source evidence for every accepted address;
- explicit reviewer reason when choosing image-based fallback;
- conflict warnings where an address may be a claimant home rather than inspection site.

Also preserve the operational distinction: a correct inspection address is desirable, but if the evidence remains weak, using a physical address can imply an inspection location that may be challenged. The reviewer should see the evidence and decide.

---

## 11. Edge cases and mitigations

| Edge case | Risk | Mitigation |
|---|---|---|
| EXIF missing | No GPS evidence | Continue with OCR/provider/history. |
| EXIF points to sender’s office, not vehicle location | Wrong address | Compare capture time, image content, provider rules, and garage clues. Require review. |
| WhatsApp/compressed images | Metadata likely absent or reduced | Treat absence as expected, not failure. |
| Residential driveway images | Correct location may be claimant home | Require explicit classification: `client/home`, `garage`, `storage`, `unknown`. |
| OCR reads nearby unrelated signage | False match | Require phone/email/postcode or multiple signals for high confidence. |
| Multiple garages in same postcode/industrial estate | Ambiguous candidate | Show multiple candidates and require user selection. |
| Provider uses multiple storage yards | Provider rule alone insufficient | Use source-specific rules and historical acceptance counts. |
| Google Places stale/incorrect listing | Wrong address | Cross-check against local garage corpus and OCR. |
| Visual model hallucination | False address | Do not allow visual-only auto-export. |
| Address in instruction conflicts with image evidence | Report risk | Block export until reviewer resolves conflict. |

---

## 12. Acceptance criteria

Initial MVP should pass these tests:

1. If the instruction contains a complete inspection address with postcode, candidate score ≥ 0.90 and source evidence shows instruction snippet.
2. If provider rule says a known garage and no conflicting evidence exists, candidate appears but requires review unless historically very strong.
3. If image EXIF GPS is within 50 m of a known garage, the garage candidate appears with GPS and reverse-geocode evidence.
4. If OCR extracts a phone number matching the garage corpus, candidate score is high and evidence shows the cropped OCR snippet.
5. If OCR extracts only a postcode shared by multiple locations, candidate remains medium/low and export requires review.
6. If no signals exist, the system does not silently fill “Image Based Assessment”; it asks for confirmation or lets the reviewer mark image-based with reason.
7. EVA export blocks until address is accepted/edited or image-based fallback is explicitly selected.
8. Every accepted address stores `acceptedBy`, `acceptedAt`, and source signals.
9. Historic accepted addresses feed future ranking but do not silently override contradictory evidence.
10. Admin can add a new garage from review and immediately reuse it.

---

## 13. Implementation notes for CollisionCC

### 13.1 Immediate code changes

1. Remove the automatic `Image Based Assessment` fallback in `src/parser/candidates.ts`.
2. Add `inspectionAddressCandidates` to the case model.
3. Add a review-panel component for address candidates.
4. Add export validation in `src/lib/eva-export.ts` so that `Inspection Address` requires accepted candidate, manual edit, or reviewed image-based fallback.
5. Import garage/provider data into Firestore seed data.

### 13.2 Suggested schema additions

```ts
type CaseInspectionAddressState = {
  acceptedCandidateId?: string;
  finalAddressLines?: string[];
  finalAddressMode:
    | "confirmed_physical_address"
    | "manual_physical_address"
    | "image_based_assessment"
    | "unknown";
  imageBasedReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};
```

### 13.3 Suggested scoring function sketch

```ts
function scoreCandidate(candidate: InspectionAddressCandidate): number {
  let score = 0;

  for (const signal of candidate.sourceSignals) {
    score += signal.confidenceDelta;
  }

  if (candidate.conflicts.length > 0) {
    score -= 0.30;
  }

  if (candidate.sourceSignals.every(s => s.type.startsWith("vision_"))) {
    score = Math.min(score, 0.55);
  }

  return Math.max(0, Math.min(1, score));
}
```

### 13.4 Suggested OCR text extraction patterns

```ts
const ukPostcode = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
const ukPhone = /(?:\+44\s?|0)(?:\d[\s().-]?){9,10}\d/g;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
```

Normalize phone numbers to E.164-ish comparison form before matching:

```ts
function normalizeUkPhone(raw: string): string {
  return raw
    .replace(/[^\d+]/g, "")
    .replace(/^0044/, "+44")
    .replace(/^0/, "+44");
}
```

---

## 14. Connector coverage and research notes

All requested connector categories were used.

| Connector | Use | Notes |
|---|---|---|
| GitHub connector | Inspected the public `collisionengineers/CollisionCC` repository, including README, admin overview, architecture, parser, domain types, EVA export, package dependencies, and public helper libraries. | Functional and useful. |
| Consensus | Located and fetched academic sources on smartphone geotagging accuracy, EXIF geotagging workflows, and location privacy. | Useful for EXIF feasibility and privacy. |
| Sider Scholar | Ran Google Scholar searches for smartphone photo GPS/EXIF/geotagging accuracy; OpenAlex calls errored, but Scholar search produced relevant papers. Also queried RAG for image/OCR/document processing. | Useful as additional literature discovery; not the primary authority for implementation. |
| Tailo Lens | Ran research and verification queries. Direct research results were limited; verification supported the general claims that EXIF GPS, reverse geocoding, OCR, and Cloud Vision-style OCR/object/logo signals are plausible sources. | Used as a validation pass rather than as primary evidence. |

---

## 15. Final recommendation

Build the assistant in the following order:

1. **Corpus first:** import and normalize garage/provider rules from the job sheet.
2. **Parser change:** stop defaulting missing address to `Image Based Assessment`.
3. **Candidate model:** store multiple candidates with evidence.
4. **Review UI:** make address selection an explicit admin decision.
5. **EXIF + Maps:** add GPS extraction, reverse geocoding, and nearby garage search.
6. **OCR:** add Cloud Vision OCR and deterministic phone/email/postcode matching.
7. **Vision/Gemini:** use visual AI for clues, not final decisions.
8. **Feedback loop:** every admin-confirmed address improves future suggestions.

This approach preserves user control, reduces incorrect image-based reports, turns staff domain knowledge into reusable data, and fits the Google Cloud direction already selected for CollisionCC.

---

## Sources

[^collision-readme]: Collision Engineers, `CollisionCC` README, GitHub. The README frames the system as a planned replacement/co-ordination layer for workflows currently spread across EVA, Box, Outlook, Excel/job sheets, Audatex, WhatsApp, and manual handoffs. `https://github.com/collisionengineers/CollisionCC`

[^collision-readme-cloud]: Collision Engineers, `CollisionCC` README, GitHub. The README identifies the planned direction as a Google Cloud-based platform, including web app/backend, Google Cloud AI, Firebase, and related services. `https://github.com/collisionengineers/CollisionCC`

[^admin-systems]: Collision Engineers, `docs/reference_information/processes/collision_engineers_admin_overview.md`, GitHub. Systems and communication channels section. `https://github.com/collisionengineers/CollisionCC/blob/master/docs/reference_information/processes/collision_engineers_admin_overview.md`

[^admin-ready]: Collision Engineers, `collision_engineers_admin_overview.md`. Ready-for-EVA process and missing-images branch. `https://github.com/collisionengineers/CollisionCC/blob/master/docs/reference_information/processes/collision_engineers_admin_overview.md`

[^admin-images-no-instruction]: Collision Engineers, `collision_engineers_admin_overview.md`. Images-without-instruction storage by registration. `https://github.com/collisionengineers/CollisionCC/blob/master/docs/reference_information/processes/collision_engineers_admin_overview.md`

[^admin-required-files]: Collision Engineers, `collision_engineers_admin_overview.md`. Files required to add to EVA: saved email, images, valuation evidence, and instruction. `https://github.com/collisionengineers/CollisionCC/blob/master/docs/reference_information/processes/collision_engineers_admin_overview.md`

[^admin-inspection-address]: Collision Engineers, `collision_engineers_admin_overview.md`. Inspection Address section. `https://github.com/collisionengineers/CollisionCC/blob/master/docs/reference_information/processes/collision_engineers_admin_overview.md`

[^architecture-stack]: Collision Engineers, `guides/developers/architecture.md`, GitHub. Stack overview: Next.js, Firebase, Cloud Run, Firestore, Cloud Storage, Secret Manager, Document AI, Microsoft Graph, EVA POST API. `https://github.com/collisionengineers/CollisionCC/blob/master/guides/developers/architecture.md`

[^architecture-data]: Collision Engineers, `guides/developers/architecture.md`, GitHub. Firestore as source of truth and Cloud Storage for files. `https://github.com/collisionengineers/CollisionCC/blob/master/guides/developers/architecture.md`

[^domain-types]: Collision Engineers, `src/domain/types.ts`, GitHub. `EvidenceFile`, `ExtractedField`, and `CaseExtraction` structures. `https://github.com/collisionengineers/CollisionCC/blob/master/src/domain/types.ts`

[^parser-labels]: Collision Engineers, `src/parser/candidates.ts`, GitHub. Inspection address label patterns. `https://github.com/collisionengineers/CollisionCC/blob/master/src/parser/candidates.ts`

[^parser-fallback]: Collision Engineers, `src/parser/candidates.ts`, GitHub. Current fallback to `Image Based Assessment` when `inspectionAddress` is missing. `https://github.com/collisionengineers/CollisionCC/blob/master/src/parser/candidates.ts`

[^eva-export-fields]: Collision Engineers, `src/lib/eva-export.ts`, GitHub. EVA payload field mapping, including Inspection Address. `https://github.com/collisionengineers/CollisionCC/blob/master/src/lib/eva-export.ts`

[^eva-export-validation]: Collision Engineers, `src/lib/eva-export.ts`, GitHub. Current validation of field count, VRM, and Work Provider. `https://github.com/collisionengineers/CollisionCC/blob/master/src/lib/eva-export.ts`

[^review-screen]: Collision Engineers, `docs/planning/archive/initial_system/03_admin_flow_requirements.md`, GitHub. Review screen requirements include extracted fields with confidence/source/snippet, missing checklist, duplicate markers, preview, and export/submit actions. `https://github.com/collisionengineers/CollisionCC/blob/master/docs/planning/archive/initial_system/03_admin_flow_requirements.md`

[^package-google]: Collision Engineers, `package.json`, GitHub. Dependencies include Google Cloud Document AI and Google Cloud/Firebase libraries. `https://github.com/collisionengineers/CollisionCC/blob/master/package.json`

[^job-sheet]: Local workbook analysis of `/mnt/data/Backup of CE Job Sheet 260429.xlsm` using `artifact_tool`; inspected `Garages!A1:F40`, `Principals!B2:K60`, and `Jobs!A1:AE226`.

[^sentry-location]: Local file `/mnt/data/Sentry_API_Complete_Guide.md`, lines 250–288. Claim Location Update supports `LocationName`, `Address`, `Town`, `City`, `County`, `Postcode`, `Telephone`, `Email`, `ContactName`, `LocationType`, and `ApprovedRepairer`.

[^exifr]: Mike Kovarik, `exifr`, GitHub README. EXIF/GPS JS parser; supports GPS conversion to latitude/longitude. `https://github.com/MikeKovarik/exifr`

[^exiftool-vendored]: PhotoStructure, `exiftool-vendored.js`, GitHub README. Node.js wrapper for ExifTool; examples include reading `GPSLatitude` and `GPSLongitude`. `https://github.com/photostructure/exiftool-vendored.js`

[^libpostal]: OpenVenues, `libpostal`, GitHub README. International street-address parsing/normalization using statistical NLP and open data. `https://github.com/openvenues/libpostal`

[^node-vision]: Google APIs, `google-cloud-node/packages/google-cloud-vision`, GitHub README. Cloud Vision Node.js client and samples. `https://github.com/googleapis/google-cloud-node/tree/main/packages/google-cloud-vision`

[^node-documentai]: Google APIs, `google-cloud-node/packages/google-cloud-documentai`, GitHub README. Cloud Document AI Node.js client and samples. `https://github.com/googleapis/google-cloud-node/tree/main/packages/google-cloud-documentai`

[^maps-node-client]: Google Maps Platform, `google-maps-services-js`, GitHub README. Server-side Node.js client for Google Maps Web Services and notes on newer Maps packages. `https://github.com/googlemaps/google-maps-services-js`

[^vision-features]: Google Cloud, Cloud Vision API features list. `https://cloud.google.com/vision/docs/features-list`

[^vision-ocr]: Google Cloud, “Detect and extract text from images,” Cloud Vision API documentation. `https://cloud.google.com/vision/docs/ocr`

[^vision-logo]: Google Cloud, “Detect logos,” Cloud Vision API documentation. `https://cloud.google.com/vision/docs/detecting-logos`

[^vision-landmark]: Google Cloud, “Detect landmarks,” Cloud Vision API documentation. `https://cloud.google.com/vision/docs/detecting-landmarks`

[^vision-object]: Google Cloud, “Detect multiple objects,” Cloud Vision API documentation. `https://cloud.google.com/vision/docs/object-localizer`

[^vision-web]: Google Cloud, “Detect Web entities and pages,” Cloud Vision API documentation. `https://cloud.google.com/vision/docs/detecting-web`

[^document-ai-overview]: Google Cloud, Document AI overview. `https://cloud.google.com/document-ai/docs/overview`

[^document-ai-ocr]: Google Cloud, Enterprise Document OCR documentation. `https://cloud.google.com/document-ai/docs/enterprise-document-ocr`

[^geocoding-overview]: Google Maps Platform, Geocoding API overview. `https://developers.google.com/maps/documentation/geocoding/overview`

[^reverse-geocoding]: Google Maps Platform, Reverse geocoding request and response documentation. `https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding`

[^places-text]: Google Maps Platform, Places API Text Search documentation. `https://developers.google.com/maps/documentation/places/web-service/text-search`

[^places-nearby]: Google Maps Platform, Places API Nearby Search documentation. `https://developers.google.com/maps/documentation/places/web-service/nearby-search`

[^gemini-image-understanding]: Google Cloud, Vertex AI Gemini image understanding documentation. `https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-understanding`

[^gemini-limitations]: Google Cloud, Vertex AI Gemini image understanding limitations section. `https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/image-understanding`

[^geotagging-accuracy]: Ryser, Spichiger, Jaquet-Chiffelle, “Geotagging accuracy in smartphone photography,” *Digital Investigation*, 2024. Retrieved via Consensus.

[^automatic-geotagging]: Prasetiyo et al., “Automatic geotagging using GPS EXIF metadata of smartphone digital photos in tree planting location mapping,” *Journal of Physics: Conference Series*, 2021. Retrieved via Consensus.

[^location-privacy]: Primault et al., “The Long Road to Computational Location Privacy: A Survey,” *IEEE Communications Surveys & Tutorials*, 2018 / arXiv. `https://arxiv.org/abs/1810.03568`

[^sider-exif-results]: Sider Scholar Google Scholar search, “smartphone photo GPS EXIF geotagging accuracy,” run 2026-06-01. Relevant results included “Mobile Forensics: Extracting Geo-Location Data from Photos on Android Smartphones” and “Accuracy of smartphone location services for geo-tagged data collection: A field study.”

