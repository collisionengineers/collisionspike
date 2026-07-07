---
id: TKT-066
title: Assistant can't find a case by spaced registration + tool failures are invisible
status: verify
priority: P1
area: ai
tickets-it-relates-to: [TKT-060, TKT-067, TKT-072]
research-link: docs/tickets/verify/TKT-066-assistant-lookup-observability/evidence/operator-note.md
plan: PLAN-001
---

# Assistant can't find a case by spaced registration + tool failures are invisible

## Problem

Asking the assistant about a case by its registration written with a space (e.g. "YT13 UTV")
fails — the assistant reports it can't find the case, or claims an "internal error". Two code
root causes (verified live 2026-07-06; both `POST /api/assistant/chat` calls returned **200**,
and App Insights showed **no DB errors** at the lookup times — the failure is silent):

1. **Lookup normalization gap.** `lookup_case` in `api/src/functions/assistant.ts` (~line 88)
   matches `c.vrm ILIKE '%YT13 UTV%'`, but intake stores VRMs **compacted** (`YT13UTV` —
   `extractVrm` strips spaces), so a spaced-VRM query can never match. Case/PO queries have the
   same weakness.
2. **Tool failures are swallowed unlogged.** `runChat` in `api/src/lib/aoai-chat.ts` (~line 174)
   catches any tool exception and feeds `{error}` back to the model **without logging** — the
   model then tells the user "internal error" while telemetry shows nothing. There is also no
   retry, so a one-off Postgres cold-connect (5s `connectionTimeoutMillis` in
   `api/src/lib/db.ts`) surfaces straight to the user.

## Evidence

- `evidence/operator-note.md` — the full 2026-07-06 diagnostics & fix plan (this ticket =
  section 1; the diagnostic summary at the top records the live verification).
- `api/src/functions/assistant.ts` ~line 88 — the `ILIKE` four-way match with no
  space/format normalization.
- `api/src/lib/aoai-chat.ts` ~lines 171–176 — `catch (e) { result = { error: … } }` with no
  logger in scope.
- Live behaviour: assistant lookups for a spaced VRM return "not found"; App Insights
  (workspace `DefaultWorkspace-…SUK`) has no correlated failure record.

## Proposed change

PROPOSED (not built):

- **Normalize the lookup.** Compare space/case-insensitively on VRM and Case/PO —
  e.g. `replace(upper(c.vrm),' ','') LIKE replace(upper($1),' ','')` — keeping plain `ILIKE`
  for claimant/ref. Trim + collapse the incoming query string once at the top of `execTool`.
- **Log tool failures.** Pass a logger into `runChat` (or wrap `execTool`) so every tool
  exception emits `ctx.warn('[assistant] tool <name> failed: <msg>')`; extend the audit-lite
  event with `toolErrors: n` so failures are countable in telemetry.
- **Retry once.** A failed tool query is retried one time before the `{error}` fallback
  (covers Postgres cold-connect within the pool's connection timeout).

## Acceptance

- [ ] `lookup_case` finds the same case for `YT13 UTV`, `yt13 utv`, and `YT13UTV` (and the
      space-insensitive rule holds for Case/PO, e.g. `CCPY 26050` → `CCPY26050`).
- [ ] Claimant/ref matching behaviour is unchanged (plain substring, case-insensitive).
- [ ] A deliberately failing tool emits a `[assistant] tool <name> failed:` warn trace visible
      in App Insights, and the audit-lite event carries `toolErrors ≥ 1`.
- [ ] A transient first-attempt tool failure (mocked) succeeds via the single retry with no
      user-visible error.
- [ ] No write path is added — the assistant stays read-only (TKT-060 invariant).

## Verification requirements (proof standard — all four classes required before `done`)

1. **Offline tests** — api unit tests for the normalization (spaced/compact/lower-case VRM +
   Case/PO in, same match set out) and for the retry + `toolErrors` counting in `runChat`
   (injected `complete`/tool mocks). All existing suites stay green.
2. **Gate** — `node verify-all.mjs` green; deploy per `docs/azure/deploy.md` recorded in
   [changes.md](./changes.md) with commit ids.
3. **Live probe (behaviour)** — call the deployed `POST /api/assistant/chat` with a real spaced
   VRM (e.g. `YT13 UTV`) and record the reply naming the correct case in
   [verification.md](./verification.md) (raw response captured).
4. **Live probe (telemetry)** — trigger/observe one tool failure and capture the App Insights
   KQL result showing the `[assistant] tool … failed` trace + the audit-lite `toolErrors`
   dimension. `done` requires all of the above recorded in [verification.md](./verification.md).

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-assistant-intake-search-fixes.md`
(section 1 + diagnostic summary); full plan preserved in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note (full plan)](./evidence/operator-note.md)
