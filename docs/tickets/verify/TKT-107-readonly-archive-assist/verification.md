# Verification — TKT-107: Read-only Box archive assist (suggest-only)

## Verdict
TESTED (offline)

## Evidence
- `api/src/lib/archive-lookup.test.ts` — suggest-only behaviour; no mint/write path; honours the
  configured read-only archive roots; honest-empty when unconfigured.
- `node verify-all.mjs` API gate green.

## Pending / gaps
- **Not deployed.** Live proof (deploy `cespk-api-dev`; with the read-only archive root(s) configured, an
  unmatched reference surfaces candidate Box folders; a write is never attempted) is pending deploy +
  operator confirmation. Box read is already live per [docs/gated.md](../../../gated.md) (D2), so this rung
  needs no new Box credential.

## How to re-verify
Offline: `npm --prefix api test`. Live (after deploy): ask the assistant to find the archive folder for a
known Case/PO and confirm it returns a suggestion and performs no Box write.
