# Changes — TKT-107: Read-only Box archive assist (suggest-only)

## Status
verify — built (read-only, suggest-only); code-complete + tested offline, not yet deployed. Under
[PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 (read-only Box archive lookup tool).

## Files touched
- `api/src/lib/archive-lookup.ts` (+ `archive-lookup.test.ts`) — `archiveLookup(query, limit)` +
  `archiveConfigured()`; reads `gates.retroBoxArchiveRootIds()` and calls `listBoxFolderEntries`. **Never
  mints** and never writes — it only suggests archive matches.
- `api/src/lib/functions-client.ts` — the Box folder-listing facade used by the lookup.
- `api/src/functions/assistant.ts` — an `archive_lookup` read executor, wired suggest-only.

## Summary
Decouples read-only archive assistance from the sequence-blocked retro-reconstruction (ADR-0022). The
assistant can surface likely Box archive folders for an unmatched reference without creating anything —
strictly suggest-only, honouring the configured read-only archive roots.
