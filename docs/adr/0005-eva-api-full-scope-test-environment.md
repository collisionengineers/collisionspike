# ADR-0005 — EVA Sentry API remains in scope and test-first

**Status:** Accepted (2026-06-17).

## Decision

Keep the EVA Sentry REST API in product scope and validate it with vendor test credentials before any
production use. Maintain the current schema-validated JSON handoff as an explicit fallback.

REST enablement requires both:

1. vendor support for routing multiple Principal Codes; and
2. a parity test proving the submitted case matches the current handoff.

## Rationale

The API can remove manual handoff work, but the current one-principal limitation is incompatible with the
business. Credential scope selects the vendor environment, so secret separation and test evidence are
load-bearing.

## Consequences

The API path stays unavailable until the two conditions pass. Token handling, payload validation,
idempotency, image order, and fallback behaviour require contract tests.
