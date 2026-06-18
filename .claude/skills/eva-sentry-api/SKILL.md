---
name: eva-sentry-api
description: EVA "Sentry" API v1.2 reference for collisionspike — auth/token lifecycle, the eight endpoints, the 12-field EVA JSON contract, and the photo-order/image rules. Use when building or validating EVA submission (Sentry REST calls, Instruction/Inspection payloads, the JSON drag-drop export, the EVA custom connector) or when you need the exact field order, formats, or endpoint shapes. Pairs with the eva-sentry-integration agent.
---

# EVA "Sentry" API v1.2

Authoritative source of truth (in order): `docs/reference/Sentry API Documentation 1.2 Amended.pdf`
(99 pp, field-level) → `docs/architecture/eva-sentry-api.md` (transcribed surface) → ADR-0005. The
essentials are below; for per-endpoint field depth, **re-read the PDF** (no public URL exists).

## Scope (ADR-0005)
Full scope, built/validated against the **EVA test environment** now. Base URL is the **same** for
test and prod — the **credentials route the environment** (test `Client_Id`/`Client_Secret` → test
server). `EVA_API_ENABLED` toggles the REST API vs the **JSON drag-drop** path (drag-drop = M1 path +
permanent fallback). Production cutover is gated until prod is confirmed and a **parity test** passes.

## Base & auth
- **Base URL:** `https://sentry.evasoftware.co.uk/api/` (same test/prod).
- **Token:** `POST /Connect/token`, `Content-Type: application/x-www-form-urlencoded`, body
  `Client_Id` + `Client_Secret`. Response `{ "access_token": "<JWT>", "expires_in": 5 }` — **minutes**.
  Refresh proactively with a ~30s buffer.
- **All other calls:** header `Authorization: Bearer {access_token}`.
- Credentials are **secrets** (Key Vault / Dataverse secret env vars) — never echo them.

## Endpoints
| # | Method & path | Purpose |
|---|---|---|
| 1 | `POST /Instruction/Inspection` | Instruct claim — create/submit a case (rich payload). |
| 2 | `POST /Claim/LocationUpdate` | Update inspection location (LocationName, Address, Town, City, County, Postcode, phone/email, contact, LocationType, ApprovedRepairer). |
| 3 | `POST /Claim/AuthorityStatusUpdate` | Repair authority status (approve/amend/reject). |
| 4 | `POST /Note/SubmitNote` | Submit a note. |
| 5 | `POST /Claim/Update` | Status / lifecycle update. |
| 6 | `POST /Report/SubmitReport` | Submit a completed assessment report. |
| 7 | `GET /Report/GetAvailableReports` | List retrievable released reports. |
| 8 | `GET /Report/GetReport?id={id}` | Retrieve a specific report. |

Claim-targeting endpoints match a claim by field combinations (e.g. claim ref + postcode) — see the
PDF per endpoint.

## The 12-field EVA JSON contract (drag-drop + deterministic core)
Exact order matching `Final Format Example 02.json`. `cedocumentmapper_v2.0` emits this
schema-validated — validate, don't redrive.
1. Work Provider  — **must be non-empty**
2. Vehicle Model
3. Claimant Name
4. Claimant Telephone
5. Claimant Email Address
6. Date of Loss — `DD/MM/YYYY`
7. Date of Instruction — `DD/MM/YYYY`
8. Accident Circumstances
9. Inspection Address — **6 newline-separated lines** (or `Image Based Assessment`)
10. VAT Status — ∈ {"", Yes, No}
11. Mileage
12. Mileage Unit — ∈ {"", Miles, Km}

> **Engineer allocation is NOT an EVA submission field.** Per the product owner's ruling (B3 RESOLVED),
> it is left blank and assigned inside EVA *after* submission, so it was removed entirely from the
> contract — the payload is exactly these 12 fields.

The `Instruction/Inspection` API payload is **richer** than this: vehicle/claim identity, multiple
postcodes (repairer/inspection/salvage), claim type, `DamageType`/`DamageType2`/`DamageType3`,
estimate/cost fields, and base-64 **Impact Image** entries EVA renders into the report PDF. Read the
PDF for the full payload before wiring the connector.

## Photo order & image rules (apply to API and manual paths)
- Upload **2 preview photos first** — vehicle **overview** (full registration visible) + **main-damage
  closeup** — **then all photos in sequence, including those two again**.
- **Likely two requests** (confirm on the test env): previews first, then the remaining images.
- Readiness: **≥2 EVA images** incl. **≥1 overview** (registration visible) + **≥1 damage_closeup**.
- **Exclude any photo showing a person's reflection** — unusable.
- Mirrors `collisioncc` `src/lib/image-rules.ts` + `case-status.ts` (reference, not gospel).

## Implementation notes
- Build an **EVA custom connector** from this surface; gate with `EVA_API_ENABLED` / `EVA_BASE_URL`.
- **Idempotency by payload hash.**
- EVA submit couples with **Box archival** (UPPERCASE Case/PO folder); EVA itself uses lowercase.
- For field-level accuracy, always re-read `docs/reference/Sentry API Documentation 1.2 Amended.pdf`.
