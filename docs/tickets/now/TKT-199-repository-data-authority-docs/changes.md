# Changes — TKT-199: Make repository data authority explicit without weakening security

## Status
built — pending independent live/security review

## Changes made

- Added the dated binding authority and its cited decision inventory.
- Removed PII-only repository ignore rules, corrected TKT-068's obsolete filename-only model guidance, and retained credential, egress, tenant/RLS and production-write controls.
- Added a deterministic data-authority checker with direct/paraphrased deny and stale/overbroad allowlist fixtures; integrated it into the full documentation check.
- Added the retained-reference ledger and linked the previously orphaned parser-planning record.
