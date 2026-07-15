# Integrations

## Microsoft Graph mail

Orchestration receives push notifications for the approved mailboxes, fetches the complete message, and
uses immutable message identity plus payload digest for idempotency. A durable monitor renews
subscriptions. Scope remains limited to the configured mailboxes.

## EVA

The current handoff is the schema-validated JSON export. The Sentry REST path remains unavailable until
the vendor supports multiple Principal Codes and a test-versus-current parity run passes. See the
[field model](./eva-field-model.md) and [API reference](./eva-sentry-api.md).

## Archive

Box provides the human-navigable Archive, per-Case/PO folders, and account-free File Requests. Calls use a
service identity held by the Archive service. Incoming events are signature-checked, replay-protected,
deduplicated, and scope-checked. Archive updates are additive and one-way.

## Vehicle facts

The vehicle-enrichment service calls DVLA and DVSA directly using approved service credentials. It owns
registration normalization, source snapshots, MOT cleaning, and mileage estimation. The Data API owns
case application and auditing. See [vehicle data](./vehicle-data.md).

## Address assistance

The address corpus supplies full-address suggestions. Postcode and mapping services may validate or help
staff search, but they do not replace the full-address selection rule and do not derive an address from
the EVA `Loc` field.

## Document and image processing

The parser is the deterministic document extraction boundary. OCR handles scanned documents and plate
text. Image analysis may suggest image roles or safety warnings, but output remains reviewable and does
not replace source bytes.

## AI capabilities

AI features expose suggestions and bounded tools through a shared capability registry. Authorization is
enforced at the Data API. Destructive actions are human-only. Assistant writes use propose, current-state
re-read, confirmation, optimistic concurrency, and the existing staff-authorized route.

## Failure policy

Every external integration has an explicit timeout, retry/idempotency rule, safe degraded state, and
auditable error. A failed optional integration must not cause silent case loss or claim success.
