# Verification — TKT-111: Assistant write tier with human confirmation

## Verdict
TESTED (offline)

## Evidence
- `services/data-api/src/platform/http/concurrency.test.ts` — `If-Match` present → 409 on stale version; absent → skipped
  (stable existing behavior).
- `packages/domain/src/capabilities/registry.test.ts` — `merge_cases`/destructive are never proposable;
  proposable set is write ∧ not-humanOnly.
- `services/data-api/src/features/assistant/chat-routes.test.ts` — `propose_action` performs no mutation.
- SPA suite covers `ConfirmActionCard` re-fetch + diff + 409 handling. `node verify-all.mjs` green.

## Pending / gaps
- Built DARK: `ASSISTANT_WRITE_TIER_ENABLED` defaults **off**; `propose_action` is absent from the toolset
  until flipped.
- **Not deployed, and the flip is DPIA-gated.** Live proof (propose→confirm→execute end to end, with a
  concurrent-edit 409) requires deploy + per-capability **E2/G5 sign-off + DPIA** — see
  [docs/tickets/BOARD.md](../../BOARD.md) (§F). `scrubPii` is a precision-over-recall pre-scrub, not
  "de-identified" — the DPIA must reflect that.

## How to re-verify
Offline: `npm --prefix services/data-api test`, `npm --prefix apps/web test`. Live (after flip + DPIA): from the
assistant, propose a `set_on_hold`; confirm the card diff matches a fresh DB read; execute; then repeat with
a concurrent edit in another tab and confirm the second execute 409s.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — record update: deployed DARK (the standing "not deployed" is stale); acceptance line 1 is now live fact.** `propose_action`, `ASSISTANT_WRITE_TIER_ENABLED`, and the `staleVersion`/If-Match concurrency code are in the deployed api bundle (07-09/07-10 publishes; ticket board §F step 1 DONE), and the gate is ABSENT from live app-settings — "assistant writes gated off by default" is live-proven, not just test-asserted. `assistantChat` live; the toolset excludes `propose_action` while off (offline-pinned). Remaining, operator-gated (ticket board §F4 STAYS OFF): per-capability DPIA + E2/G5 sign-off (must state `scrubPii` is precision-over-recall, not de-identification) → flip → live propose→confirm→execute + concurrent-edit 409. Destructive-exclusion (`merge_cases` never proposable) stays offline-proven. Verified by: ticket-verifier dispatch, 2026-07-10.

## Configuration-intent reconciliation — 2026-07-14

PENDING — the 2026-07-10 dark-state note above is prior. The validated 2026-07-11 deployment
record states that the operator-attested approvals were complete and records
`ASSISTANT_WRITE_TIER_ENABLED=true`; a fresh 2026-07-14 readback confirms the gate remains true. Source
inspection confirms `propose_action` captures a proposal rather than executing SQL. This reconciles the
setting's intent but does **not** close the ticket: no independent current proof captures a signed-in
propose→structured-diff→human-confirm→existing-route execution or the required stale-version 409, so the
behavioral acceptance remains PENDING.

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the earlier live/dark/deployed verdicts for the PR 55 repair. The write gate is
still off in the deployed stack; no repaired confirmed write is claimed live.

- Capability schemas now match the actual staff routes: inbound reclassification is `PATCH`, compact
  case creation is normalised through the manual-create path, claimant/provider/registration fields
  use server truth, and generic edits cannot split provider identity. Registry, assistant and API
  route tests cover the generated method/path/body and stale `If-Match` refusal.
- Confirmed mutations survive optional fast-path status failure, show the independently fetched
  target, retain their success result until Dismiss and publish invalidation only after a committed
  write. `ConfirmActionCard.test.ts`, `rest-client.test.ts` and `mutation-events.test.ts` cover applied
  replay rules, created-resource identity, errors and exact mounted-resource refetch signals.
- File Request creation is database-generation/outbox driven. Repeated clicks share the pending
  generation, remote failures remain replayable and completion atomically stores the public link. API
  outbox and maintenance-monitor tests prove the API is the sole owner; the old orchestration starter
  is a 410 tombstone.
- `attach-validate.test.ts` proves an unresolved attachment batch cannot be replaced by a second
  selection or retargeted by later conversation. Shared EVA edit tests pin the case route's lengths,
  dates, VAT and mileage-unit semantics.
- Deployment proof still required: apply the outbox schema, deploy API/services/orchestration/SPA, start the
  singleton monitor, smoke every advertised capability with a signed-in user, then enable the write
  gate and repeat a stale-version refusal. No destructive/model-issued write has been added.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

PENDING

## Evidence

- The implementation is deny-by-default in source: `packages/domain/src/gates.ts:70-73` enables the tier
  only when `ASSISTANT_WRITE_TIER_ENABLED === 'true'`. The current live configuration is no longer dark:
  `docs/tickets/BOARD.md:964-969`, `LIVE_FACTS.json:185-198`, and
  `docs/operations/live-environment.md:101-104` record activation in the validated 2026-07-11 release
  and a fresh 2026-07-14 readback of `true`. This reconciles the stale dark-state wording in the older
  verification block; configuration presence is not behavioral proof.
- The 2026-07-11 release record shows PR 55 merged as
  `c7e78cc49e4c5f626bb3ade2b4b653ddecd45241`, the corrected API runtime as
  `3cc4705041766afdeb70b07c1e097b76f5ec8097`, all API/services/orchestration/SPA areas published, and the
  write-tier setting true (`docs/operations/live-environment.md:334-341`). The later deployed dashboard tree
  `54a04d131c0ee8051e354ebfe8ba1f6656db9947` also contains that lineage
  (`docs/operations/live-environment.md:71-120`).
- The model cannot execute the write: `services/data-api/src/features/assistant/chat-routes.ts` exposes one
  `propose_action` tool whose executor validates and returns a proposal for the SPA; it does not dispatch
  a mutation. `apps/web/src/features/assistant/ConfirmActionCard.tsx:576-615` executes only after explicit
  confirmation, and retains distinct stale/unknown outcomes.
- Confirmed actions reuse the registered staff routes.
  `packages/domain/src/capabilities/registry.ts:216-316` maps each capability to an existing method/path;
  `apps/web/src/data/rest-client.ts:328-436,623` independently fetches the target, denies existing-target
  execution without a version, and sends that version in `If-Match`.
  `services/data-api/src/platform/http/concurrency.ts` defines stale-version refusal as HTTP 409.
- Destructive/direct model writes remain excluded: `merge_cases` is `humanOnly`
  (`packages/domain/src/capabilities/registry.ts:307-316`), while the proposable set filters out every
  `humanOnly` capability and validation rejects one
  (`packages/domain/src/capabilities/registry.ts:346-371`). The ticket records focused offline coverage
  for route shapes, no-mutation proposal handling, fresh-state confirmation, and stale 409 handling
  (`docs/tickets/verify/TKT-111-assistant-write-tier/verification.md:4-12,41-51`).

## Pending / gaps

- No independent witness exists for the required signed-in live chain: assistant proposal → structured
  card based on independently fetched state → explicit human confirmation → existing staff-authorized
  route → committed row/audit readback.
- No independent witness exists for the required live stale-state case: a target changes after the card
  snapshot and confirmation of the old proposal returns 409 without overwriting the newer state.
- `ASSISTANT_WRITE_TIER_ENABLED=true` proves only exposure/configuration. It cannot satisfy either
  behavioral acceptance item. Per `docs/tickets/BOARD.md:968-969` and the reconciled ticket record at
  `verification.md:31-39`, the ticket must remain pending.
- This verification deliberately performed no write, fabricated stimulus, firewall change, or signed-in
  operator action.

## How to re-verify

1. With an authorized staff account in the live SPA, ask the assistant to propose one harmless,
   reversible capability against a real eligible record. Capture the structured proposal and the card's
   independent target GET/version.
2. Confirm only after comparing the card with the fresh record. Capture the exact existing route,
   method/body, `If-Match`, 2xx response, committed database state, and corresponding audit record.
3. Repeat on another eligible record, but change that record through the normal UI after the card snapshot
   and before confirmation. Confirm the stale card and capture HTTP 409 plus a readback proving the
   intervening change was not overwritten.
4. Confirm in the same signed-in session that destructive/human-only capabilities such as `merge_cases`
   are not available to `propose_action`.

## Confidence + unread surfaces

High confidence that the gate, proposal-only model boundary, existing-route mapping,
optimistic-concurrency machinery, destructive exclusion, and deployed lineage exist. Insufficient
confidence to certify live behavior because the two mandatory operator witnesses are absent.
Unread/unexercised surfaces: authenticated live SPA network exchange, live proposal response body,
confirmed-write database/audit rows, and the stale-confirmation 409 response.
