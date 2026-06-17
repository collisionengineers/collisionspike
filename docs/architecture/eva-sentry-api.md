# EVA "Sentry" API — Reference (v1.2)

Authoritative endpoint surface, transcribed from `raw/Sentry API Documentation 1.2 Amended.pdf`
(99 pp; the PDF is the field-level source of truth). The spike keeps EVA integration **gated**:
JSON drag-drop export now; this REST API later behind `EVA_API_ENABLED` (it is in testing, awaiting
EVA's developers). Supersedes the looser endpoint names in the older collisioncc guide.

## Base & auth
- **Base URL:** `https://sentry.evasoftware.co.uk/api/`
- **Auth:** `POST /Connect/token` — `Content-Type: application/x-www-form-urlencoded`, body
  `Client_Id` + `Client_Secret`. Response `{ "access_token": "<JWT>", "expires_in": 5 }`
  (**minutes** — short-lived, refresh with a ~30s buffer).
- All other calls: header `Authorization: Bearer {access_token}`.

## Endpoints
| # | Method & path | Purpose |
|---|---|---|
| 1 | `POST /Instruction/Inspection` | **Instruct claim** — create/submit a case. Rich payload (below). |
| 2 | `POST /Claim/LocationUpdate` | Update inspection location (LocationName, Address, Town, City, County, Postcode, phone/email, contact, LocationType, ApprovedRepairer). |
| 3 | `POST /Claim/AuthorityStatusUpdate` | Repair authority status (approve/amend/reject). |
| 4 | `POST /Note/SubmitNote` | Submit a note (internal/external commentary). |
| 5 | `POST /Claim/Update` | Status / lifecycle update. |
| 6 | `POST /Report/SubmitReport` | Submit a completed assessment report. |
| 7 | `GET /Report/GetAvailableReports` | List retrievable released reports. |
| 8 | `GET /Report/GetReport?id={id}` | Retrieve a specific report. |

Claim-targeting endpoints match a claim by one of several field combinations (e.g. claim ref +
postcode) — see the PDF per endpoint.

## Instruction/Inspection payload (shape)
Far richer than the 13-field drag-drop JSON. Includes vehicle/claim identity, multiple **postcodes**
(repairer, inspection location, salvage), **claim type** (e.g. Post-Inspection, Post-Repair Audit,
Post-Repair, valuation dispute, salvage), **DamageType / DamageType2 / DamageType3**, estimate/cost
fields (DeleteSavingsNet/Gross, etc.), and **base-64 "Impact Image" entries** that EVA renders into
the final report PDF. The photo-ordering and registration-visible rules from the manual process map
onto the image entries.

## Spike implications
- `cedocumentmapper_v2.0`'s schema-validated **13-field JSON** remains the drag-drop path and the
  deterministic core; the API payload adds image and claim-detail fields on top.
- Build an **EVA custom connector** from this surface; gate with `EVA_API_ENABLED` /
  `EVA_BASE_URL`; idempotency by payload hash; handle the 5-minute token with a refresh buffer.
- Image submission via the API means the **two-preview-then-full-sequence** ordering and
  **no-person-reflection** rules apply to the API path too, not just manual EVA upload.
- For field-level accuracy when wiring the connector, read the PDF in `raw/` directly.
