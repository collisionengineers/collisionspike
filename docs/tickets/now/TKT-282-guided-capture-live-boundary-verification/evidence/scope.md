# Scope — TKT-282 (formerly CCAP-013)

Original CCAP-013 checklist, carried forward: fragment-secret exchange + history-clearing, resume-cookie
renewal (near-expiry and post-401), terminal session states, idempotent upload-creation and submission,
manifest reconciliation after recovery/lifecycle events.

Urgency: TKT-159's 2026-07-20 live-facts audit (`docs/tickets/now/TKT-159-feature-gate-intent-audit/`)
found `PUBLIC_CAPTURE_ENABLED=true`, `CAPTURE_SESSIONS_ENABLED=true`, `CAPTURE_DIRECT_UPLOAD_ENABLED=true`
live on `cespk-api-dev`, without the documented Front Door ingress-lockdown prerequisite, and without
this ticket's round-trip evidence existing. Operator decision recorded in TKT-159: leave exposed,
document only, no mutation — pending this verification.
