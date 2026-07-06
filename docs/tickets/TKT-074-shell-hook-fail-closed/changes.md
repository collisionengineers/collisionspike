# Changes — TKT-074: Every terminal command is blocked — the Box scope-guard hook fails closed

## Status
DONE (2026-07-06) — fixed + validated on all three shell-guard adapters.

## Root cause
The `beforeShellExecution` / `PreToolUse` adapters awaited the stdin **`'end'`** event and used a
**static** `import` of `box-scope-lib.mjs` at module load. The Cursor harness writes the event JSON to
stdin but does **not close** it, so `'end'` never fired and the hook produced no output within the ~60s
fail-closed deadline → the harness blocked **every** shell call, Box or not. (Claude Code's harness
closes stdin, so its adapter had been working — hardened anyway for the shared bug class.)

Proven live before fixing: the old Cursor adapter, fed a non-Box command with stdin held open, blocked
until the pipe closed (`elapsed=3163ms` in a 3s-held probe; unbounded when stdin never closes).

## Fix (all three adapters share the pattern)
- `.cursor/hooks/cursor-box-scope-guard.mjs` (JSON `{permission}` protocol) — primary P0.
- `.claude/hooks/box-scope-guard.mjs` (exit-code 0/2 protocol) — validated via an in-place `.new.mjs`
  copy first (my own Bash runs through this hook) then promoted; shell confirmed still working post-swap.
- `.codex/hooks/box-scope-guard.mjs` (exit-code 0/2 protocol) — promoted from the validated content.

Each adapter now:
1. Resolves stdin on a **short timer (700ms)** regardless of `'end'` — data arrives at spawn, so the
   timer only bounds the wait for a close that never comes.
2. **Lazy-imports** `./box-scope-lib.mjs` (a slow/failed import can't hang module load).
3. Runs a module-level **watchdog (1500ms)** that **fail-OPENS** if anything stalls — it fires only when
   we have **not** positively identified a Box command.
4. For a command **positively identified as Box**, cancels the watchdog and **fails CLOSED** on any
   validation error (unchanged guard logic: folder-0, out-of-allowlist ids, webhook targets).

`box-scope-lib.mjs` (the shared classify/analyze logic) is **unchanged** — the guard's protective
behaviour is preserved, only the I/O plumbing was made non-blocking.

## Files
- `.cursor/hooks/cursor-box-scope-guard.mjs` (rewritten)
- `.claude/hooks/box-scope-guard.mjs` (rewritten)
- `.codex/hooks/box-scope-guard.mjs` (rewritten)

## Note
`.cursor/hooks.json` keeps `failClosed: true` (correct — a genuinely mis-behaving guard should still
block); the fix removes the *cause* of the mis-behaviour rather than weakening the fail-closed policy.
