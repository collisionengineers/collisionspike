# Changes — TKT-308

## Status

No repository code change. This ticket records the required live configuration state; per
AGENTS.md ("Repository work does not authorize a deployment, cloud configuration change...") an
operator applies and confirms it.

## Required live state — CONFIRMED 2026-07-22T10:19:22Z

- `RETRO_CASE_ENABLED` = `false` on `cespk-orch-dev`. ✅
- `RETRO_CASE_ENABLED` = `false` on `cespk-api-dev`. ✅

Both were already `false` when read; no configuration change was made. Read-back evidence,
the adjacent `RETRO_*` values, and the code read proving `retroCase` is the master gate at
every retro entry point are in [verification.md](./verification.md).

## Verification pending

The remaining acceptance criterion — no new `reconstructionSource` audit event for the rest
of the alpha window — is a forward-looking watch and stays open. Check the `audit_event`
table rather than App Insights (free-tier KQL retention collapses intra-day).
