# ADR-0020 — Providers may lodge cases through a machine-to-machine API

**Status:** Accepted (decision proposed 2026-07-03; implementation tracked by TKT-055).

## Decision

Add a provider API as a third intake channel alongside mail and manual entry. It accepts structured case
fields plus instruction/evidence files, uses the same validation, deduplication, Case/PO mint, evidence,
readiness, audit, and Archive paths, and returns a stable result for an idempotency key.

Provider credentials identify exactly one active Work Provider and are stored only as salted/peppered
verification material. They do not grant staff or general Data API access. Requests are size- and type-
bounded, schema-validated, rate-limited, and rejected if the provider identity conflicts with the body.

## Rationale

Structured intake removes avoidable parse/classification uncertainty for providers with their own case
systems without creating a second case model.

## Consequences

The public contract is versioned under `docs/reference`. Duplicate identical requests replay the first
committed response; reuse with different content fails. Provider-origin evidence retains its channel and
original filenames, and all resulting writes remain auditable.
