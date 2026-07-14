# Verification — TKT-111: Assistant write tier with human confirmation

## Verdict
TESTED (offline)

## Evidence
- `api/src/lib/concurrency.test.ts` — `If-Match` present → 409 on stale version; absent → skipped
  (back-compat).
- `packages/domain/src/capabilities/registry.test.ts` — `merge_cases`/destructive are never proposable;
  proposable set is write ∧ not-humanOnly.
- `api/src/functions/assistant.test.ts` — `propose_action` performs no mutation.
- SPA suite covers `ConfirmActionCard` re-fetch + diff + 409 handling. `node verify-all.mjs` green.

## Pending / gaps
- Built DARK: `ASSISTANT_WRITE_TIER_ENABLED` defaults **off**; `propose_action` is absent from the toolset
  until flipped.
- **Not deployed, and the flip is DPIA-gated.** Live proof (propose→confirm→execute end to end, with a
  concurrent-edit 409) requires deploy + per-capability **E2/G5 sign-off + DPIA** — see
  [docs/gated.md](../../../gated.md) (§F). `scrubPii` is a precision-over-recall pre-scrub, not
  "de-identified" — the DPIA must reflect that.

## How to re-verify
Offline: `npm --prefix api test`, `npm --prefix mockup-app test`. Live (after flip + DPIA): from the
assistant, propose a `set_on_hold`; confirm the card diff matches a fresh DB read; execute; then repeat with
a concurrent edit in another tab and confirm the second execute 409s.

## Verdict update — 2026-07-10 (final sweep, ticket-verifier dispatch; transcribed verbatim)

**PENDING — record update: deployed DARK (the standing "not deployed" is stale); acceptance line 1 is now live fact.** `propose_action`, `ASSISTANT_WRITE_TIER_ENABLED`, and the `staleVersion`/If-Match concurrency code are in the deployed api bundle (07-09/07-10 publishes; gated.md §F step 1 DONE), and the gate is ABSENT from live app-settings — "assistant writes gated off by default" is live-proven, not just test-asserted. `assistantChat` live; the toolset excludes `propose_action` while off (offline-pinned). Remaining, operator-gated (gated.md §F4 STAYS OFF): per-capability DPIA + E2/G5 sign-off (must state `scrubPii` is precision-over-recall, not de-identification) → flip → live propose→confirm→execute + concurrent-edit 409. Destructive-exclusion (`merge_cases` never proposable) stays offline-proven. Verified by: ticket-verifier dispatch, 2026-07-10.

## Configuration-intent reconciliation — 2026-07-14

PENDING — the 2026-07-10 dark-state note above is historical. The validated 2026-07-11 deployment
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
- Deployment proof still required: apply the outbox schema, deploy API/orchestration/SPA, start the
  singleton monitor, smoke every advertised capability with a signed-in user, then enable the write
  gate and repeat a stale-version refusal. No destructive/model-issued write has been added.
