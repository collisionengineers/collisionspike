---
name: eva-sentry-api
description: EVA Sentry API v1.2 reference for collisionspike, covering authentication, the eight endpoint families, the canonical twelve-field payload, image ordering, idempotency, and server-side submission. Use when changing EVA contracts, services/functions/eva-sentry, or any submission caller.
---

# EVA Sentry API v1.2

The field-level authority is the extracted current reference under `docs/reference`.
The implementation authority is the contract in `packages/domain`, the JSON schema
in `contracts`, and `services/functions/eva-sentry`. Read those before changing a
caller.

## Authentication

- Base URL: `https://sentry.evasoftware.co.uk/api/`.
- Mint a token with `POST /Connect/token` using form fields `Client_Id` and
  `Client_Secret`.
- Treat `expires_in` as minutes and refresh with a safety buffer.
- Send `Authorization: Bearer <token>` on every other request.
- Credentials are secret references and must never be logged, returned, or stored
  in fixtures.

## Endpoint families

1. `POST /Instruction/Inspection` creates an inspection instruction.
2. `POST /Claim/LocationUpdate` updates inspection location.
3. `POST /Claim/AuthorityStatusUpdate` updates repair authority.
4. `POST /Note/SubmitNote` submits notes and ordered files.
5. `POST /Claim/Update` updates claim lifecycle state.
6. `POST /Report/SubmitReport` submits a completed report.
7. `GET /Report/GetAvailableReports` lists released reports.
8. `GET /Report/GetReport?id={id}` retrieves one report.

Check the current reference for exact target-key combinations and optional fields.

## Canonical twelve-field core

Preserve this order and the existing JSON names:

1. Work Provider (required)
2. Vehicle Model
3. Claimant Name
4. Claimant Telephone
5. Claimant Email Address
6. Date of Loss (`DD/MM/YYYY`)
7. Date of Instruction (`DD/MM/YYYY`)
8. Accident Circumstances
9. Inspection Address (six newline-separated lines, or `Image Based Assessment`)
10. VAT Status (`""`, `Yes`, or `No`)
11. Mileage
12. Mileage Unit (`""`, `Miles`, or `Km`)

Engineer allocation is not a submission field. The richer instruction body adds
claim identity, vehicle identity, location, damage, cost, and file fields without
changing this core.

## Images and idempotency

- Send the overview with the full registration visible and the main-damage closeup
  as the two previews, then send the full ordered set including those images.
- Exclude any image showing a person's reflection.
- Preserve sequence indices and filename extensions.
- Use the finalized payload hash as the idempotency key.
- The production caller is the orchestration service; the server-side EVA function
  owns token lifecycle and credentials.

Keep `EVA_API_ENABLED` default-off until the approved environment is configured and
the contract tests pass. Record functional mismatches in their ticket instead of
changing an external route or body during unrelated cleanup.
