# Archive integration function

Owns server-side archive operations and the signed webhook receiver. The Data API
and orchestration service are its callers; browsers never call the external archive
service directly.

## Contract

`function_app.py` registers folder, file, shared-link, file-request, search, webhook
management, content-download, and `POST /api/box-webhook` routes. Existing route names
and response shapes are public contracts.

Webhook processing verifies signatures, resolves the owning case, writes evidence and
audit events through the Data API, and asks that API to recompute status. Retryable
failures return a non-success response so the sender can redeliver.

## Configuration

Configuration is supplied through app settings and secret references. Important names
include `BOX_API_ENABLED`, archive authentication values, `DATA_API_URL`, and
`DATA_API_AUDIENCE`. Do not put credentials in this directory.

## Tests and deployment

Run `pytest` from this directory. Infrastructure is defined in `infra/main.bicep`;
deployment remains an explicitly approved operation outside PLAN-006.
