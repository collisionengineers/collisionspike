# Document parser function

Hosts the vendored `cedocumentmapper_v2` engine and exposes the current parser routes:

- `GET /api/fingerprint`
- `POST /api/parse`
- `POST /api/extract-images`
- `POST /api/classify-email`
- `POST /api/explode-eml`

The orchestration service and Data API are the callers. Route names and response shapes
are stable public contracts.

## Source and behavior

The engine source is pinned and verified by `scripts/verify_vendor_pin.py`. Domain rules,
the EVA schema, deterministic email classification, and provider matching stay in that
engine. Defensive document decoding accepts one redundant base64 wrapper without tying
the behavior to any particular transport.

## Tests and deployment

Run `pytest` from this directory and run the vendor-pin verifier from the repository
root. Infrastructure is defined in `infra/main.bicep`; deployment is outside PLAN-006.
