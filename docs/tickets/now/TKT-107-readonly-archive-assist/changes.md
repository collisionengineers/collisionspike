# Changes — TKT-107: Read-only Box archive assist (suggest-only)

## Status
verify — built (read-only, suggest-only); code-complete + tested offline, not yet deployed. Under
[PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 (read-only Box archive lookup tool).

## Files touched
- `services/data-api/src/features/archive/lookup.ts` (+ `archive-lookup.test.ts`) — `archiveLookup(query, limit)` +
  `archiveConfigured()`; reads `gates.retroBoxArchiveRootIds()` and calls `listBoxFolderEntries`. **Never
  mints** and never writes — it only suggests archive matches.
- `services/data-api/src/platform/http/service-client.ts` — the Box folder-listing facade used by the lookup.
- `services/data-api/src/features/assistant/chat-routes.ts` — an `archive_lookup` read executor, wired suggest-only.

## Summary
Decouples read-only archive assistance from the sequence-blocked retro-reconstruction (ADR-0022). The
assistant can surface likely Box archive folders for an unmatched reference without creating anything —
strictly suggest-only, honouring the configured read-only archive roots.

## Config (2026-07-10) — archive root armed on the api (operator-authorized)

- Archive root confirmed **read-only first** via the Box CLI (`box folders:get 4077648161`): id
  **`4077648161`**, name **"Collision Engineers"**, root-level (parent `All Files`), `item_status:
  active`, ~494.7 GB, **7 top-level entries** (Business development, …) — the same root already
  scope-locked on the box-webhook facade (`BOX_READONLY_ROOT_IDS=4077648161`). One root; no comma-list
  needed.
- **`RETRO_BOX_ARCHIVE_ROOT_IDS=4077648161` SET on `cespk-api-dev`** (readback-verified). Effect:
  `archiveConfigured()` → true, so the assistant now advertises the **`archive_lookup`** read tool
  (`ASSISTANT_TOOLSET_V2` already live). Config-only — no deploy; the lookup code shipped with the
  PLAN-001 api publishes.
- Deliberately **NOT set on `cespk-orch-dev`**: the api has no minting reader (only
  `archive-lookup.ts`), and the R2 auto-reconstruction rung stays dark pending the ticket board D11
  Case/PO sequence alignment.
- The ticket's **inbox-hint half** (suggest-only "may match archive folder X" on unmatched emails)
  remains open — not built in this batch.
