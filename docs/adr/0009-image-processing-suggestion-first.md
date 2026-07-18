# ADR-0009 — Image processing is staged and suggestion-first

**Status:** Accepted (2026-06-17); amended 2026-07-16 per [Review 160726](../reviews/160726/decisions.md).

## Decision

Use OCR first for registration detection and scanned-document text. Image-role classification and
person/reflection warnings use the approved Foundry vision model only as suggestions. Staff retain the
final image-role and readiness decision.

Do not build new work on services with announced retirement dates. A model change requires data-
protection approval, representative evaluation, versioned output, and a fail-closed gate.

## Rationale

Registration text is a high-value deterministic signal. Image roles and incidental-person detection are
more ambiguous and sensitive, so they require explicit review and stronger evaluation.

## Consequences

Original images remain immutable. OCR text, classifications, warnings, model identity, and human
disposition are separate, auditable artifacts.

## Amendment — engines of record and the registration-presence flag (2026-07-16)

The registration-reading engine of record is the local ALPR engine (fast-alpr), with the Document
Intelligence Read model as fallback for scanned-document text. Image-role classification and
person/reflection warnings use the approved Foundry vision model, as suggestions only.

The registration-presence flag is a byproduct of the same ALPR pass — it costs nothing extra and is
cheaper than a vision call, which answers the gating-cost question; comparative figures live in the
TKT-017 benchmark, not here.

The model-change gate in this ADR applies to AI model adoption generally, not only to image models: a
new AI task (for example the odometer reading contemplated by
[ADR-0006](./0006-vehicle-enrichment-service-boundary.md)) passes the same data-protection approval,
representative evaluation, versioned output, and fail-closed gate.
