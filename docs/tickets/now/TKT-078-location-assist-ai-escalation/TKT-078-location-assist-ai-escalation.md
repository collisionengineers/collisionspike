---
id: TKT-078
title: Deeper photo-based location suggestion — AI reasoning escalation (gated)
status: now
priority: P2
area: ai
tickets-it-relates-to: [TKT-077, TKT-015, TKT-016]
research-link: docs/tickets/now/TKT-078-location-assist-ai-escalation/evidence/operator-note.md
---

# Deeper photo-based location suggestion — AI reasoning escalation (gated)

## Problem

Even with real photo bytes + POI search (TKT-077), the deterministic assist tier (OCR + regex +
geocode) will miss hard cases — oblique signage, partial street furniture, landmark-only clues.
There is a designed but unbuilt escalation: a vision-reasoning pass
(`docs/tickets/README.md`) that reasons over the
photos when the deterministic tier is weak. Without it, hard photo-only cases dead-end at
"Image Based Assessment" even when the photos plainly show a locatable site.

## Evidence

- `evidence/operator-note.md` — plan Phase D (2026-07-06 planning session).
- Design pack: `docs/tickets/README.md`.
- The AOAI deployment (`digital-3339-resource`, `gpt-5`) is already live per the registry
  [live-environment.md](../../../operations/live-environment.md) — same keyless deployment the
  chat helper + email triage use.
- Host: the same Function as the deterministic tier (`cespkloc-fn-a7tzj2`, TKT-077).

## Proposed change

PROPOSED (not built) — an escalation **branch** in the location-suggest Function:

- **Model call**: reuse the deployed keyless AOAI `gpt-5`; structured outputs, temperature 0,
  ≤3–4 photos per call, prompt constraint "only report what is visibly evidenced".
- **Own gate** `LOCATION_ASSIST_AI_ENABLED` (default off) + per-case and per-day caps + spend
  telemetry — separate from the deterministic tier's gate so it can be flipped independently.
- **Provenance**: AI candidates are re-geocoded via Maps and carried with `ai_reasoning`
  provenance, distinguishable from deterministic candidates end-to-end.
- **UI**: a reviewer-pressed "Try a deeper photo-based suggestion" action, offered when the
  deterministic tier returns weak/no candidates (plain user language; never auto-invoked).
- **Operator**: production AI sign-off per docs/tickets/BOARD.md E2 before the gate flips live.

ADR-0013 intact: candidates are suggestions; a human always confirms.

## Acceptance

- [ ] With the gate OFF, behaviour is byte-identical to the deterministic tier (no model call —
      proven by telemetry absence).
- [ ] With the gate ON, a hard photo case yields structured, visibly-evidenced candidates with
      `ai_reasoning` provenance, re-geocoded via Maps.
- [ ] Per-case and per-day caps enforce (the N+1th call is refused and logged); spend telemetry
      is queryable.
- [ ] The escalation only runs on explicit reviewer action, and nothing is auto-applied.
- [ ] The gate flip is recorded in ticket board/E2 with operator sign-off before production use.

## Verification requirements (proof standard)

1. **Offline tests** — unit tests for the branch: gate-off short-circuit, cap enforcement,
   structured-output parsing, provenance tagging (mocked AOAI).
2. **Gate** — `node verify-all.mjs` green; Function redeploy + app settings recorded in
   [changes.md](./changes.md); `LIVE_FACTS.json` + mirror updated for the new gate.
3. **Live probe (off)** — with the gate off, one assist run shows no model call in telemetry.
4. **Live probe (on)** — with the gate on (operator-sanctioned window), one hard photo case:
   capture the structured candidates, the `ai_reasoning` provenance, the Maps re-geocode, and
   the spend telemetry row. Record in [verification.md](./verification.md).
5. **Cap probe** — exceed a cap deliberately and capture the refusal + log line.

## Research

Distilled 2026-07-06 from the operator planning session `PLAN-inspection-address-repair.md`
(Phase D) + the phase-4 design pack; excerpt in [evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)

## Reopened follow-up — 2026-07-14

Independent PLAN-005 verification found that `MAX_AI_PHOTOS=4` limits images inside one request but no
durable per-case or per-day invocation caps exist.

### Acceptance

- Durable counters enforce the ticket's per-case and per-day deep-reasoning limits across host restarts
  and concurrent requests.
- The N+1 request is refused before model invocation and produces non-sensitive, queryable telemetry.
- Focused boundary/concurrency/restart tests cover both caps and prove a refused call cannot consume model
  capacity.
- Registry tracking includes the location Function's gate state.
- After deployment, an approved hard-photo session proves the structured candidate, `ai_reasoning`
  source, Maps re-geocode and usage record; cap-refusal proof occurs only in an approved controlled
  environment, not by manufacturing production work.

Evidence: [PLAN-005 reopen follow-up](./evidence/reopen-followup-2026-07-14.md).
- [Operator note (excerpt)](./evidence/operator-note.md)
