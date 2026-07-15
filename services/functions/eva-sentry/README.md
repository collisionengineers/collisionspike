# EVA submission function

Owns EVA authentication, payload validation, image ordering, idempotency, and the
`POST /api/eva/instruction-inspection` submission route. The orchestration service is
the production caller.

## Contract

The request uses the canonical twelve-field EVA payload plus ordered images. Stable
field names and response shapes are shared with `@cs/domain` and must not drift.
Idempotency uses the finalized payload hash supplied by the caller. The function
refreshes EVA access tokens server-side and never exposes credentials to clients.

## Configuration

`EVA_API_ENABLED`, EVA endpoint and credential settings, storage access, and telemetry
are supplied through app settings and secret references. No credential belongs in the
repository.

## Tests and deployment

Run `pytest` from this directory. Infrastructure is defined in `infra/main.bicep`;
deployment is a separately approved production operation.
