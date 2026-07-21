# ADR-0018 — The parser engine is authored externally and vendored as a pinned core

**Status:** Accepted and implemented (2026-07-12). **Superseded by [ADR-0035](./0035-cedocumentmapper-engine-repository-consolidation.md) (2026-07-20)** — the engine is now authored directly in this
repository; the vendor-and-pin mechanism below no longer exists. Kept for historical context.

## Decision

`cedocumentmapper_v2.0` is the authoring source for the deterministic parser engine. This repository
vendors only the headless engine core into `services/functions/parser/cedocumentmapper_v2` and pins it to
an immutable committed reference recorded in `VENDOR_LOCK.json` and `PROVENANCE.md`.

Parser changes land in the authoring repository first, with tests, then are re-vendored by the documented
procedure. The vendored copy is not hand-edited. Desktop UI, CLI, evaluation harnesses, local model assist,
and authoring resources remain outside the service boundary.

## Rationale

The parser is both a standalone product and a cloud capability. One engine source avoids behavioural
forks while the pinned copy keeps this repository buildable and deployable independently.

## Consequences

CI verifies the reference, complete digest, permitted boundary, provider seed, and cross-language
contract. Licensing remains an explicit dependency record. The cloud service adds only transport,
observability, defensive decoding, and contract adaptation around the engine.
