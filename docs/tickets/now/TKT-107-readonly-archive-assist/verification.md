# Verification — TKT-107: Read-only Box archive assist (suggest-only)

## Verdict
**FAILED → REOPENED 2026-07-10** (ticket-verifier dispatch) — against the Acceptance as written:
(1) acceptance line 1 (the inbox "may match archive folder X · Open in Box" hint) is
**unimplemented**; (2) the implemented assistant rung is deployed but a **live no-op**
(`RETRO_BOX_ARCHIVE_ROOT_IDS` absent). Neither is a live regression; the standing "TESTED (offline)"
record understated both. See the [reopen follow-up](./evidence/reopen-followup-100726.md).

## Sweep verdict (transcribed verbatim, 2026-07-10)

- **Line 1 (unmatched email shows "may match archive folder X · Open in Box"): UNIMPLEMENTED.**
  `archiveLookup`'s **only** consumer across `services/data-api`, `services/orchestration`, `apps/web`, and `packages` is
  `services/data-api/src/features/assistant/chat-routes.ts` (grep-proven); the inbox hint at
  `apps/web/src/features/inbox/Inbox.tsx:674-682` is TKT-093's *open-case* `linkSuggestionCasePo`, not an
  archive match; no re-scope exists (ADR-0022 doesn't mention TKT-107/suggest-only; TKT-119/140 are
  the retro locate/drain tickets — different scope, both done).
- **Line 2 (assistant archive lookup): deployed but a live no-op.** The code IS in the live api
  build (changes.md's "not yet deployed" is stale — `archiveLookup`/`RETRO_BOX_ARCHIVE_ROOT_IDS` ×3
  in the live-lineage bundle; the api redeployed repeatedly since 07-08), but
  `RETRO_BOX_ARCHIVE_ROOT_IDS` is **absent on `cespk-api-dev`** (az, by name, today) →
  `archiveConfigured()` false → `toolsForRequest()` (assistant.ts:141) never advertises
  `archive_lookup`, so no live probe can pass.
- **Line 3 (gate/scope): guardrails healthy** — facade `BOX_READONLY_ROOT_IDS=4077648161` confirmed
  live today; `archive-lookup.ts` is list/match-only (never mints/writes); unit suite covers
  suggest-only + honest-empty.

### FAILED substance
(a) The email-surface suggestion rung — the ticket's own "direct, safe half of R2" and its first
acceptance line — needs build work; no flip or awaited event closes it.
(b) `RETRO_BOX_ARCHIVE_ROOT_IDS=4077648161` needs setting on `cespk-api-dev` (engineer/operator — a
live-behavior mutation: it advertises a new assistant tool to staff; operator-gated per the
build-dark doctrine).
Expected absences: the live assistant probe and the "no case created" Postgres check are unreachable
until (b); no-mint is code-proven meanwhile.

### How to re-verify (after (b), and (a) once built)
Staff chat "is there an archive folder for CCPY26050?" → matches + Open-in-Box links; case count
unchanged before/after (no mint); no allocator advance. Config check:
`az functionapp config appsettings list -g rg-collisionspike-dev -n cespk-api-dev --query "[?name=='RETRO_BOX_ARCHIVE_ROOT_IDS']"`.

Verified by: ticket-verifier dispatch, 2026-07-10.

## Prior verdict (superseded — understated the gaps)
TESTED (offline) — `archive-lookup.test.ts` suggest-only behaviour; "Not deployed" (stale: the code
has since ridden the api deploys; the config + the line-1 surface were the real gaps).
