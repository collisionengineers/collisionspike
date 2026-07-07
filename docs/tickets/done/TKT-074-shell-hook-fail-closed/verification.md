# Verification — TKT-074: Every terminal command is blocked — the Box scope-guard hook fails closed

## Verdict
RESOLVED (2026-07-06) — fix applied + validated on all three adapters. Latency now far below the
fail-closed deadline; the Box scope protection is retained (out-of-scope commands still denied).

## 1. Root cause (regression note)
The adapters awaited stdin `'end'` (never emitted by the Cursor harness — it leaves stdin open) plus a
static lib import. Empirically confirmed on the **old** Cursor adapter: a non-Box command with stdin
held open 3s did not return until the pipe closed — `elapsed=3163ms` — i.e. it waits for `'end'`; in the
harness where stdin never closes this is the ~60s timeout → fail-closed on **every** command.

## 2. Latency proof (fixed adapters, stdin held open 5s so `'end'` never comes; node's own exit timed)
| Adapter | Scenario | node exit | Result |
|---|---|---|---|
| `.cursor` | non-Box, held 5s | **897ms** | allow |
| `.cursor` | empty stdin | 895ms | allow |
| `.claude` | non-Box, held 5s | **883ms** | rc0 (allow) |
| `.claude` | non-Box, stdin closes normally | 165ms | rc0 (allow) |
| `.codex` | non-Box, held 5s | **881ms** | rc0 (allow) |

All ≪ the ~60s fail-closed deadline. (~700ms = the stdin timer; ~165ms when stdin closes promptly.)

## 3. Guard-behaviour retained (three-probe acceptance)
| Adapter | (a) neutral | (b) in-scope Box read | (c) out-of-scope Box |
|---|---|---|---|
| `.cursor` | `{permission:allow}` | `box folders:get <root>` → `{permission:allow}` | `box folders:get 0` → `{permission:deny}` (folder-0 message); `box folders:get 999999999` → `{permission:deny}` (out-of-allowlist message) |
| `.claude` | rc0 | rc0 | folder 0 → **rc2** + `[box-scope-guard] BLOCKED — … folder 0 …`; id 999999999 → **rc2** + `… outside the test folder …` |
| `.codex` | rc0 | rc0 | folder 0 → **rc2** + BLOCKED |

Also verified: non-`Bash` tool events → allow (rc0); unparseable/empty stdin → allow.

## 4. Self-safety
`.claude/hooks/box-scope-guard.mjs` is the guard my own Bash tool runs through. It was validated as an
in-place `box-scope-guard.new.mjs` copy (same dir so `./box-scope-lib.mjs` resolves) across all scenarios
**before** promotion; after `cp` over the live file, a subsequent Bash call succeeded (`shell-ok …`),
confirming no self-block.

## How to re-verify
Run each adapter with a synthetic event via `node <adapter> < <(printf '<event>'; sleep 5)` — Cursor
event shape `{"command":"…"}`, Claude/Codex shape `{"tool_name":"Bash","tool_input":{"command":"…"}}` —
and confirm: neutral allows fast, in-scope Box allows, `folder 0` / an out-of-allowlist id denies.
