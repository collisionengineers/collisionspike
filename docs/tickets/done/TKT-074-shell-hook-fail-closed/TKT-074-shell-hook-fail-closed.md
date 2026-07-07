---
id: TKT-074
title: Every terminal command is blocked — the Box scope-guard hook fails closed
status: done
priority: P0
area: platform
tickets-it-relates-to: [TKT-061, TKT-075, TKT-080]
research-link: docs/tickets/done/TKT-074-shell-hook-fail-closed/evidence/operator-note.md
---

# Every terminal command is blocked — the Box scope-guard hook fails closed

## Problem

**No agent can run any terminal command in this workspace.** The Cursor `beforeShellExecution`
hook `.cursor/hooks/cursor-box-scope-guard.mjs` (the Box test-scope guard from the TKT-061 Box
CLI work) is configured fail-closed, and it currently produces no output within the harness
deadline (observed: 60s timeout / "returned no output") — so the harness blocks **every** Shell
call, Box-related or not. Confirmed live twice on 2026-07-06 (the inspection-repair
investigation session, and again during this distillation session on a trivial directory
listing). Until fixed, nothing can build, test, deploy, or even run `node
scripts/check-tickets.mjs` — this ticket gates all implementation work.

## Evidence

- `evidence/operator-note.md` — the plan's Precondition section + the verbatim rejection
  message captured live this session.
- `.cursor/hooks/cursor-box-scope-guard.mjs` — the adapter: reads stdin, imports
  `../../.claude/hooks/box-scope-lib.mjs`, should emit `{permission:'allow'}` for non-Box
  commands; something in that path hangs or dies silently (import failure, stdin never ending,
  or `loadConfig()` blocking are the candidate culprits).
- The sibling logic lives in `.claude/hooks/box-scope-lib.mjs`.

## Proposed change

PROPOSED (not built):

- **Diagnose** the adapter by running it directly with a synthetic stdin event (once runnable —
  or via a non-Shell execution route) to see whether the import, `readStdin`, or `loadConfig()`
  hangs.
- **Fix** so the common path is fast and non-blocking: emit `{permission:'allow'}` immediately
  for non-Box commands *before* any config/lib work; add a hard internal timeout that
  fail-OPENS for non-Box commands (the guard only needs to fail closed for commands it has
  positively identified as Box-scoped).
- If a code fix can't restore it quickly, the fallback is the operator disabling the hook in
  Cursor Settings > Hooks (recorded as a temporary measure) — the Box scope protection should
  then be re-established before further Box testing.

## Acceptance

- [ ] A trivial shell command (e.g. a directory listing) executes without hook rejection.
- [ ] A Box command **inside** the allowed test scope is still allowed.
- [ ] A Box command **outside** the allowed scope (e.g. referencing folder 0) is still denied —
      the guard's protective behaviour is preserved, not just removed.
- [ ] The hook completes well under the harness deadline on the common path.

## Verification requirements (proof standard)

1. **Live command probe** — run three real commands through the agent Shell tool and record
   the outcomes in [verification.md](./verification.md): (a) a neutral command (allowed),
   (b) an in-scope Box CLI read (allowed), (c) an out-of-scope Box command (denied with the
   guard's message).
2. **Latency proof** — the hook's wall-clock on the neutral command (timed run or hook log)
   is far below the fail-closed deadline.
3. **Regression note** — record the root cause found (import/stdin/config) and the guard
   behaviour retained, so the Box-scope protection isn't silently weakened.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Precondition section) + a live rejection captured during distillation; excerpt in
[evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (excerpt + live capture)](./evidence/operator-note.md)
