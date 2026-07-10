# Reopen follow-up — TKT-107 (2026-07-10)

## Why reopened (verify → now, --force)

The 2026-07-10 verify-sweep ruled **FAILED against the Acceptance as written** — the standing
"TESTED (offline)" verdict understated two gaps (neither a live regression):

1. **Acceptance line 1 is unimplemented.** The inbox surface ("this unmatched email may match
   archive folder X · Open in Box") was never built: `archiveLookup`'s only consumer is
   `api/src/functions/assistant.ts` (grep-proven across api/orchestration/mockup-app/packages);
   the existing inbox hint (`Inbox.tsx:674-682`) is TKT-093's open-case `linkSuggestionCasePo`, not
   an archive match. No re-scope exists anywhere (ADR-0022 doesn't cover it).
2. **The implemented assistant rung is a live no-op.** The code rides the live api build (the old
   "not deployed" note is stale), but `RETRO_BOX_ARCHIVE_ROOT_IDS` is absent on `cespk-api-dev`, so
   `archiveConfigured()` is false and `toolsForRequest()` never advertises `archive_lookup`.

## Scope of the fix

1. **Build the email-surface rung (line 1):** on an unmatched inbound email whose ref/VRM matches a
   read-only archive folder listing, surface a suggest-only hint with a server-minted "Open in Box"
   deep link (mirror the TKT-093 hint pattern; suggest-only, never mint/write — ADR-0012/0022
   semantics; handler-plain strings).
2. **Config (operator/engineer):** set `RETRO_BOX_ARCHIVE_ROOT_IDS=4077648161` on `cespk-api-dev`
   (matches the facade's `BOX_READONLY_ROOT_IDS`). This advertises the `archive_lookup` assistant
   tool to staff — flip with operator awareness per the build-dark doctrine.
3. Then the live probe: staff chat "is there an archive folder for CCPY26050?" → matches +
   Open-in-Box links; case count unchanged (no mint); the inbox hint renders on a qualifying
   unmatched email.

## Guardrails already proven (don't re-litigate)

Facade `BOX_READONLY_ROOT_IDS=4077648161` live; `archive-lookup.ts` list/match-only (never
mints/writes); unit suite covers suggest-only + honest-empty.

## Exit path

Build (1) + config (2) → back to `verify` → live probe closes it.
