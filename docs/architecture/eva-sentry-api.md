# EVA "Sentry" API — Reference (v1.2)

> **Target environment:** Sandbox `Collision Engineers - Dev` (`b3090c42-…`), not the default env (`858cf5b3-…`).
> **CSP note:** any EVA REST integration called from the Code App must go via a **custom connector** (SDK) — the deployed player's `connect-src 'none'` CSP blocks raw `fetch()`. Power Automate cloud flow HTTP actions are exempt (server-side).

Authoritative endpoint surface, transcribed from `docs/reference/Sentry API Documentation 1.2
Amended.pdf` (99 pp; the field-level source of truth — v1.1 sits alongside it). Supersedes the looser
endpoint names in the older collisioncc guide.

**Scope (ADR-0005):** EVA integration is **full scope**, built/validated against the **EVA test
environment** now. The base URL is the **same** for test and production — the **credentials** decide:
**test `Client_Id`/`Client_Secret` route to a different (test) server**. `EVA_API_ENABLED` toggles
the REST API vs the drag-drop JSON path (drag-drop = M1 path + permanent fallback). The
**production** cutover is gated until prod is confirmed and a parity test passes.

## Base & auth
- **Base URL:** `https://sentry.evasoftware.co.uk/api/` (**same for test and production**). Test vs
  production is determined by the **credentials** — test `Client_Id`/`Client_Secret` route to a
  different server. Store EVA credentials as per-environment secrets.
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
Far richer than the 12-field drag-drop JSON. Includes vehicle/claim identity, multiple **postcodes**
(repairer, inspection location, salvage), **claim type** (e.g. Post-Inspection, Post-Repair Audit,
Post-Repair, valuation dispute, salvage), **DamageType / DamageType2 / DamageType3**, estimate/cost
fields (DeleteSavingsNet/Gross, etc.), and **base-64 "Impact Image" entries** that EVA renders into
the final report PDF. The photo-ordering and registration-visible rules from the manual process map
onto the image entries.

## Spike implications
- `cedocumentmapper_v2.0`'s schema-validated **12-field JSON** remains the drag-drop path and the
  deterministic core; the API payload adds image and claim-detail fields on top.
- Build an **EVA custom connector** from this surface; gate with `EVA_API_ENABLED` /
  `EVA_BASE_URL`; idempotency by payload hash; handle the 5-minute token with a refresh buffer.
- Image submission via the API means the **two-preview-then-full-sequence** ordering and
  **no-person-reflection** rules apply to the API path too, not just manual EVA upload.
- **Image submission is likely two requests** (to confirm against the test env): first send the **2
  preview images** (overview + main-damage closeup), then a second request with the **remaining**
  images.
- For field-level accuracy when wiring the connector, read the PDF in `docs/reference/` directly.
