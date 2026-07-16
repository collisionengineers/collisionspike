# Changes — TKT-067: Assistant drawer needs a "New chat" button to clear the conversation

## Status
verify — built (SPA-only, no gate); code-complete + tested offline, not yet deployed. Under
[PLAN-001](../../plans/PLAN-001-ai-mcp-hardening.md) Phase 1.

## Commits
- `7bdcb94` — ai: PLAN-001 Phase 1 (assistant drawer New-chat control).

## Files touched
- `apps/web/src/features/assistant/AssistantDrawer.tsx` — a "New chat" control that clears `turns` + `input`,
  disabled while a request is in flight.

## Summary
The assistant drawer had no way to start a fresh conversation. Added a New-chat control that resets the
turn history and input. SPA-only — no API, no gate.

## Reopened 2026-07-13

The deployed control is incorrectly disabled while an attachment confirmation is merely awaiting a
decision. The follow-up scope is to make New chat reset that pending state safely, while retaining the
disable/abort protection only for work that is actually executing.
