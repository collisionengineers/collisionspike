# Provider API intake — integration spec (v1)

> **Audience.** A work provider's own software team, integrating their case-management
> system with Collision Engineers to **lodge a case directly** (instructions + photos)
> instead of emailing. This is the publishable contract — safe to send to a provider.
>
> **Status.** Backed by [ADR-0020](../adr/0020-provider-api-intake-channel.md) and ticket
> [TKT-055](../tickets/verify/TKT-055-provider-api-intake/TKT-055-provider-api-intake.md). The
> live gate values / environment facts are in the registry
> ([live-environment.md](../operations/live-environment.md)), never re-embedded here.

## 1. Base URL & endpoint

```
POST  https://cespk-api-dev.azurewebsites.net/api/provider-intake/cases
Content-Type: application/json
X-Api-Key: cspk_………………………………
```

One request creates **one case**. The provider identity and the internal Case/PO prefix
are resolved **server-side from the API key** — they are never taken from the body.

## 2. Authentication

Every request carries an **`X-Api-Key`** header. Keys are issued by Collision Engineers
(in the admin console) and have the form `cspk_` followed by 32+ url-safe characters, e.g.
`cspk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`.

- The full secret is shown to the operator **once**, at creation, and is **not
  recoverable** — store it securely (a secret manager / vault), never in source control.
- Treat a key like a password. If it leaks, ask for it to be **revoked** and a new one
  issued. Revocation is immediate.
- A missing, malformed, unknown, or revoked key returns **`401`** with a generic body
  (the API never reveals which keys exist).

## 3. Request body

All fields are JSON. Dates are **`DD/MM/YYYY`**. Files are inlined as **Base64** (no
`data:` URI prefix). The whole request body must be **≤ 50 MB** (a `413` otherwise).

| Field | Type | Required | Format / notes |
|---|---|---|---|
| `providerReference` | string | **yes** | Your own case/claim reference (not our Case/PO). |
| `vrm` | string | **yes** | Vehicle registration. Stored upper-cased, spaces/punctuation stripped. |
| `vehicleModel` | string | no | Make + model, e.g. `Audi A3`. |
| `claimantName` | string | **yes** | |
| `claimantTelephone` | string | no | |
| `claimantEmail` | string | no | |
| `dateOfLoss` | string | **yes** | `DD/MM/YYYY`. |
| `dateOfInstruction` | string | **yes** | `DD/MM/YYYY`. |
| `accidentCircumstances` | string | **yes** | Free text describing the incident. |
| `inspectionAddress` | string | no | A 6-line address block (`\n`-separated), or the literal `Image Based Assessment`. |
| `vatStatus` | string | no | One of `""`, `"Yes"`, `"No"`. |
| `mileage` | string | no | Digits only. |
| `mileageUnit` | string | no | One of `""`, `"Miles"`, `"Km"`. |
| `instructions` | array | see note | Instruction documents (see below). |
| `images` | array | see note | Photos (see below). |

> **At least one** of `instructions` or `images` must be non-empty.

### `instructions[]` — one instruction document

| Field | Type | Required | Notes |
|---|---|---|---|
| `filename` | string | **yes** | e.g. `instruction.pdf`. |
| `contentType` | string | **yes** | MIME type, e.g. `application/pdf`. |
| `base64Data` | string | **yes** | The file bytes, Base64-encoded. |

### `images[]` — one photo

| Field | Type | Required | Notes |
|---|---|---|---|
| `filename` | string | **yes** | e.g. `overview.jpg`. |
| `contentType` | string | **yes** | e.g. `image/jpeg`. |
| `base64Data` | string | **yes** | The image bytes, Base64-encoded. |
| `imageRole` | string | no | One of `overview`, `damage_closeup`, `additional`. Omitted → classified on review. |
| `sequenceIndex` | number | no | Display order (integer ≥ 0). Omitted → arrival order. |
| `excluded` | boolean | no | `true` marks a photo as unusable. |
| `exclusionReason` | string | required if `excluded` | Why (e.g. `a person's reflection is visible`). |

### Photo guidance (for a submittable EVA set)

Collision Engineers submits photos to EVA in a fixed order, so please send:

1. **Two preview photos first** — a **vehicle overview** (the full registration must be
   legible in this photo) and a **main-damage close-up**.
2. Then **all** photos in sequence, **including those two again**.

Any photo showing **a person's reflection** is unusable — either omit it or send it with
`excluded: true` and an `exclusionReason`.

## 4. Example request

```json
{
  "providerReference": "ACME-2026-0417",
  "vrm": "AB12 CDE",
  "vehicleModel": "Audi A3",
  "claimantName": "Jane Doe",
  "claimantTelephone": "07700 900123",
  "claimantEmail": "jane.doe@example.com",
  "dateOfLoss": "04/02/2026",
  "dateOfInstruction": "06/02/2026",
  "accidentCircumstances": "Third party failed to stop at a junction and struck the nearside.",
  "inspectionAddress": "Image Based Assessment",
  "vatStatus": "No",
  "mileage": "42150",
  "mileageUnit": "Miles",
  "instructions": [
    { "filename": "instruction.pdf", "contentType": "application/pdf", "base64Data": "JVBERi0xLjQK…" }
  ],
  "images": [
    { "filename": "overview.jpg",  "contentType": "image/jpeg", "base64Data": "/9j/4AAQSkZJRg…", "imageRole": "overview" },
    { "filename": "damage.jpg",    "contentType": "image/jpeg", "base64Data": "/9j/4AAQSkZJRg…", "imageRole": "damage_closeup" }
  ]
}
```

## 5. Responses

### 201 Created

```json
{ "caseId": "b0c1…-uuid", "casePo": "ACME26042" }
```

- `caseId` — the internal case id.
- `casePo` — the minted Case/PO (`null` only if your provider record has no principal code).

The case enters the normal review workflow (a person confirms it before it goes to EVA).

### Error responses

| HTTP | Body `error` | Meaning |
|---|---|---|
| `400` | `invalid_json` | Body was not valid JSON. |
| `400` | `invalid_body` | Body was not a JSON object. |
| `400` | `missing_provider_reference` | `providerReference` empty/absent. |
| `400` | `missing_vrm` | `vrm` empty/absent (or no alphanumerics). |
| `400` | `missing_claimant_name` | `claimantName` empty/absent. |
| `400` | `invalid_date_of_loss` | `dateOfLoss` not `DD/MM/YYYY`. |
| `400` | `invalid_date_of_instruction` | `dateOfInstruction` not `DD/MM/YYYY`. |
| `400` | `missing_accident_circumstances` | `accidentCircumstances` empty/absent. |
| `400` | `invalid_vat_status` | `vatStatus` not one of `""`/`Yes`/`No`. |
| `400` | `invalid_mileage_unit` | `mileageUnit` is not one of `""`/`Miles`/`Km`, or conflicts with a unit suffix on `mileage`. |
| `400` | `invalid_mileage` | A supplied `mileage` is not plain or correctly grouped digits with an optional standalone miles/mi/kilometres/km suffix. |
| `400` | `invalid_inspection_address` | `inspectionAddress` sent but not a string. |
| `400` | `invalid_instructions` | `instructions` not an array, or an item missing a required file field. |
| `400` | `invalid_images` | `images` not an array, or an item missing a required file field. |
| `400` | `invalid_image_role` | An `imageRole` value outside the allowed set. |
| `400` | `missing_exclusion_reason` | An `excluded: true` image without `exclusionReason`. |
| `400` | `empty_submission` | Neither instructions nor images supplied. |
| `401` | `Invalid API key` | Missing/malformed/unknown/revoked key. |
| `413` | `payload_too_large` | Body exceeds 50 MB. |

Every response body is JSON: `{ "error": "<code>", "message": "<human text>" }` for the
4xx/413 cases above (the `message` is advisory; branch on `error`).

## 6. Versioning

This is **v1** of the contract. The transport is **Base64-in-JSON**; a future multipart
(`multipart/form-data`) option may be added for very large photo sets — v1 will remain
supported. Additive fields may be introduced without a version bump; a breaking change
would be a new versioned path. Field names, error codes, and the auth header are stable
within v1.
