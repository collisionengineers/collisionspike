# Changes — TKT-222: Link every related mailbox email to a reconstructed retro case

## Status
verify — implemented 2026-07-16 (same branch as TKT-219, PR #102); offline-tested; rides the next
orchestration + data-api deploy.

## What changed

- `adapters/graph.ts` — `getMessageIdentity(mailbox, id)`: one cheap `$select` read per candidate
  ($search hits carry no RFC Internet-Message-Id); null on a vanished message.
- `retro-activities.ts` — new `retroLinkRelated` activity: bounded re-sweep of every case key
  across the intake mailboxes ($top 50 per mailbox×variant), SUBJECT-corroborated filter
  (conservative v1), own-mailbox senders INCLUDED (our replies belong to the case), trigger +
  original excluded, cap 25 with logged truncation, minimal envelopes hashed via the shared
  hashPayload.
- `data-api.ts` adapter + `retro-routes.ts` `POST /api/internal/retro/link-related`: per row the
  NEVER RE-POINT guard skips any row already carrying a case_id (idempotent replays included);
  fresh rows land 'routed' with `retro_related_linked` provenance; one summary audit.
- `retro-case.ts` `finishPersisted`: invokes the backfill after statusEvaluate on every successful
  create/link arm (best-effort — a hiccup never unwinds the case).

## Gates run
orchestration build ✓ test 510 ✓ · data-api build ✓ test 1000 ✓.
