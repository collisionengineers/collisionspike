# Regression follow-up — 2026-07-11

PR 55 review confirmed that the parser engine extracts VIN but the Function wrapper discards it
before returning `/parse`. The settled EVA export must remain unchanged.

## Acceptance

- `/parse` exposes the extracted VIN with value/source/confidence semantics.
- VIN remains absent from the settled EVA export payload.
- The OpenAPI contract and route-level tests pin both behaviours.

## Implementation

- Parser engine `v2.16` is re-vendored from the pushed sibling tag and the Function wrapper now returns
  the engine's VIN cell at the top level.
- The orchestration parse type, OpenAPI schema and SPA adapter preserve the value/source/confidence
  envelope.
- The settled EVA serializer remains byte-compatible and contains no VIN field (`56161d3`).
