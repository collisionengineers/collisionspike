# Changes — TKT-308

## Status

No repository code change. This ticket records the required live configuration state; per
AGENTS.md ("Repository work does not authorize a deployment, cloud configuration change...") an
operator applies and confirms it.

## Required live state (not yet confirmed)

- `RETRO_CASE_ENABLED` unset or `false` on `cespk-orch-dev`.
- `RETRO_CASE_ENABLED` unset or `false` on `cespk-api-dev`.

## Verification pending

Live read-back via `az functionapp config appsettings list` for both apps, and a subsequent
window with no new `reconstructionSource` audit event — recorded in `verification.md` once an
operator applies the change.
