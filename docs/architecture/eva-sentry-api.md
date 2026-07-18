# EVA Sentry API

This page summarizes the current v1.2 contract. The source PDF under
[docs/reference](../reference/README.md) remains authoritative for field-level implementation.

## Availability decision

The EVA API submission path is in product scope but is not currently enabled. The vendor endpoint accepts only one
Principal Code for API submissions, while Collision Engineers requires several. Enablement requires
vendor confirmation of multi-principal routing and a parity test against the current JSON handoff.
Decision of record: [ADR-0005](../adr/0005-eva-api-full-scope-test-environment.md).

## Authentication

- Token: `POST /Connect/token`
- Content type: `application/x-www-form-urlencoded`
- Credentials: environment-specific `Client_Id` and `Client_Secret`
- Response: bearer token with a short lifetime; refresh with a safety buffer
- Store credentials only in the approved secret store

## Endpoint surface

| Method and path | Purpose |
| --- | --- |
| `POST /Instruction/Inspection` | Submit an inspection instruction |
| `POST /Claim/LocationUpdate` | Update inspection location |
| `POST /Claim/AuthorityStatusUpdate` | Update repair authority status |
| `POST /Note/SubmitNote` | Submit a note |
| `POST /Claim/Update` | Update claim lifecycle state |
| `POST /Report/SubmitReport` | Submit a completed report |
| `GET /Report/GetAvailableReports` | List released reports |
| `GET /Report/GetReport?id={id}` | Retrieve a released report |

The inspection payload is broader than the settled JSON contract and includes vehicle/claim identity,
locations, claim and damage types, costs, and base64 image entries. Image ordering and privacy rules apply
equally to both handoff methods.

## Implementation constraints

- Use idempotency keyed to the canonical request digest.
- Never log credentials, bearer tokens, or complete personal-data payloads.
- Validate against the vendor test credentials before production use.
- Keep the current JSON path as an explicit fallback.
- Treat the source PDF and executable contract tests as the final field authority.
