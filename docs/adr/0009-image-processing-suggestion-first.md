# ADR-0009 — Image processing is staged and suggestion-first

**Status:** Accepted (2026-06-17), updated to the current Azure AI services.

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
