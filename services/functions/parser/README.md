# Document parser function

Hosts a materialized copy of the `cedocumentmapper_v2` engine and exposes the current parser routes:

- `GET /api/fingerprint`
- `POST /api/parse`
- `POST /api/extract-images`
- `POST /api/classify-email`
- `POST /api/explode-eml`

The orchestration service and Data API are the callers. Route names and response shapes
are stable public contracts.

## Source and behavior

The engine is authored in `services/engine/cedocumentmapper_v2/`; this directory's copy is
materialized from that canonical source by `scripts/build/sync-engine.py` and must never be
hand-edited directly. Domain rules, the EVA schema, deterministic email classification, and
provider matching stay in the canonical engine. Defensive document decoding accepts one
redundant base64 wrapper without tying the behavior to any particular transport.

## Tests and deployment

Run `pytest` from this directory and run `python scripts/checks/check-engine-materialized.py`
from the repository root to confirm this copy still matches the canonical source. Infrastructure
is defined in `infra/main.bicep`; deployment is outside PLAN-006.
