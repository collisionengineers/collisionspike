# Verification — TKT-145: Accepted case_link on a previously-uncased email must backfill its evidence to the case

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier final ruling — the staged accept fired at 20:58Z and
the full backfill chain completed live)

## Final ruling (transcribed verbatim, 2026-07-10, ~21:25Z)

- **Acceptance 1 — accepting a case_link on a previously-uncased attachment-bearing email attaches
  its evidence to the case (regression test + live proof): MET.**
  Live accept (operator-authorized, 2026-07-10): `reviewAiSuggestion` **200** at 20:58:14.605Z on
  suggestion `025c8ce2…` (verifier's own KQL); DB B1: accepted, `reviewed_by` = staff principal.
  **Enqueue-after-commit live:** the orch queue message was minted the SAME SECOND
  (`InsertedOn 20:58:14Z`, DequeueCount 1); consumer `evidence-backfill` fired 20:58:21Z.
  **Evidence attached live:** `internalCasesEvidence` 200 at 20:59:01.143Z on case `0b07b3d3…`
  (A.QDOS26034); DB B3/B5: evidence 24 → **28** (+4: 3 damage JPGs + the .eml); audit B4:
  `100000002 "Evidence backfilled from the linked email (4 new)"` actor=`orchestration`, preceded by
  the inbound-linked + chaser-responded rows at the accept second. Link B2: email → A.QDOS26034,
  `routed`. Regression tests fresh re-run: api 3 files / **38 tests** + orch **9/9** (pin
  enqueue-after-commit, double-accept no-re-enqueue, FILL-IF-EMPTY miss no-op, TKT-133 dedup).
- **Acceptance 2 — status recompute runs after the backfill: MET.** Live ordering (verifier's own
  KQL): persist 20:59:01.**143**Z → `internalCasesStatusEvaluate` 200 @ 20:59:01.**261**Z →
  report-back `internalInboundEvidenceBackfill` **204** @ 20:59:01.**281**Z — strictly ordered inside
  the consumer chain (recompute ran without moving status, which the line permits).
- **Negative proofs weighed:** double-accept no-dup pinned at both layers; the drain-race finding (a
  mooted accept does NOT backfill — `WHERE case_id IS NULL` guard) matches deployed source; no
  `[evidence-backfill]` warn/exception rows and no failure audit — the note-on-terminal-failure path
  correctly did not fire (its live absence is the designed success signal).

Expected absences: check 5 (no new "Attachments to add" note) covered by inference — the note is
written only by the `failed` report-back branch and the report-back demonstrably took `completed`;
the consumer's Executed rows were sampled out (known App Insights gotcha) — the api-side request
chain supersedes. Out-of-scope residuals recorded in changes.md: the drain-lane rung-1 cousin gap
(new-ticket candidate), PDF-embedded photo explosion, Box-archive parity on backfilled rows.

Verified by: ticket-verifier dispatch (final ruling), 2026-07-10.

## Prior verdict (superseded)
PENDING

## Evidence
Offline: regression tests green (api 395 / orch 271 / domain 1076; `tsc -b` ×3) — enqueue-after-commit,
double-accept no-re-enqueue, note-on-terminal-failure, status-after-persist ordering, $search
corroboration (see [changes.md](./changes.md)). Deployed 2026-07-10: orch 73 / api 95 functions, the
`evidence-backfill` queue provisioned ([evidence/deploy-2026-07-10.md](./evidence/deploy-2026-07-10.md)).

## Pending / gaps
The LIVE proof is deliberately operator-performed: accept staged suggestion
`025c8ce2-a4bf-4ed7-a57d-2c1a25231975` (uncased desk@ email "Engineer Riage-Our claim REF:
46573/1- Vehicle registration: SW18EAY" → case A.QDOS26034) in the SPA, then run the post-accept
SQL/App-Insights checks in [changes.md](./changes.md) §Post-accept verifier checks
(baseline: [evidence/live-proof-staging.md](./evidence/live-proof-staging.md)).
(The earlier natural stage `e1301dc9…` was MOOTED by the TKT-140 drain — its accept is now a
harmless FILL-IF-EMPTY no-op; superseded per the re-stage record.)

## How to re-verify
See the Acceptance section of the ticket spec + changes.md §Post-accept verifier checks.

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes every stale `done`, `VERIFIED-LIVE` or deployed verdict for the PR 55 recovery
repair. Earlier staged/live rows prove the old path only.

- Accepting a case link commits the link, review decision and a durable recovery generation together.
  The publisher pages beyond lineage-ineligible poison rows, binds later generations to their accepted
  target and follows only verified merge lineage. `services/data-api/src/features/assistant/suggestion-generation-routes.test.ts` covers
  enqueue failure, a full poison page, later-generation relink refusal and a real merge redirect.
- Graph attachment/search pagination is bounded and cycle-safe; same-named files use attachment-id-
  unique Blob keys; permission lookup fails closed; relocation, 404/null and managed-identity/storage
  429/5xx failures remain retryable. Orchestration `evidence-backfill.test.ts` covers duplicate names,
  every page, partial fetches and retry/report failures.
- Evidence rows, the completed generation and exact completed/partial result commit atomically. The
  report endpoint replays stored database truth, cannot downgrade a later generation and never emits a
  false manual-attachment note after evidence landed. `internal-evidence-backfill.test.ts` covers
  exact-result replay, partial completion, superseded generations and merge ownership.
- API/merge tests pin the shared lock order so recovered evidence cannot land on a retired source. The
  singleton publisher-monitor and API-drain tests prove durable five-minute publication and guarded
  acknowledgement across host failure.
- Deployment proof still required: apply both generation/report schema deltas in order, deploy API and
  orchestration, start the singleton monitor, accept a fresh attachment-bearing case link and verify
  one exact generation, all attachments, one status recompute and no false note.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

**PENDING — hardened deployment and natural executions observed; exact post-regression live acceptance
proof is incomplete.** The 2026-07-10 VERIFIED-LIVE result proves the old path only; the binding
2026-07-11 block requires a fresh exact-generation/all-attachments/one-recompute/no-false-note proof.

## Evidence

- Deployment/runtime: current live inventory is API 111 / orchestration 87 functions (2026-07-14).
  Post-hardening telemetry shows the durable publisher path active:
  `evidence-backfill-publisher-monitor-bootstrap` 103/103 successful executions through 2026-07-14
  02:00Z; `internalEvidenceBackfillRequestDrain` 618/618 successful through 02:04Z. The initial publisher
  monitor ran 4/4 successfully. Hardened API/orchestration routes are present in live startup mappings.
- Natural case-link execution after the hardened deploy: `reviewAiSuggestion` returned 200 at 2026-07-13
  15:47:52Z. The linked message was validated at 15:48:05Z; telemetry then shows successful
  evidence/status requests at 15:48:06Z and `internalInboundEvidenceBackfill` 204. The structured report
  is `outcome=completed`, `requestedOutcome=completed`, `generation=1`, `replay=false`,
  `protectedCompletion=false` for inbound `b9b60081-fafc-4a2c-959b-f011923a3e22` targeting case
  `0e5b04d6-45e3-4121-836c-6fcb9a06c472`.
- A second structured live completion at 15:57:50Z reported generation 1 completed; its orchestration
  terminal trace recorded `attachments=1`, `persisted=0`, `status=needs_review`, consistent with
  idempotent dedup on an already-present attachment. This is supportive path evidence, not the clean
  acceptance fixture.
- Since deployment, telemetry totals include 75 `evidence-backfill` executions, 76 successful
  validations, and 37 successful 204 reports; queue-trigger request failures/retries are visible (35
  success / 40 failed executions), so aggregate health alone is not acceptance proof.
- The full ticket folder documents offline coverage for stale targets, duplicate names/attachment-id
  keys, AI permission fail-closed, Graph pagination/fetch failures, partial results, report retries,
  per-email note idempotency, merge locking, durable generations, exact-result replay, publisher paging,
  and generated-bundle checks. Those tests are not treated as live proof.

## Pending / gaps

- No clean baseline/after artifact ties the 15:47 natural acceptance to the exact Graph attachment
  inventory and resulting evidence rows/hash/storage keys.
- The live report proves generation 1 completed, but without a database read it does not independently
  expose the stored exact completed result/counts.
- Two `internalCasesStatusEvaluate` requests appear in the 15:48:06 second while a separate production
  intake was running concurrently; telemetry cannot unambiguously prove the required **one** recompute for
  this job.
- No case-note/audit read proves absence of a false manual-attachment note for that exact inbound email. A
  completed report makes such a note unlikely by source contract, but inference is insufficient for
  VERIFIED-LIVE.
- Failure/race paths remain offline-tested rather than live-exercised; no synthetic stimulus was introduced
  under the verification scope.

## How to re-verify

On the next naturally occurring attachment-bearing previously-uncased email that staff accepts as a case
link, capture before-state and the exact Graph attachment IDs/count. After completion, read the inbound row
and assert one requested generation equals one completed/reported generation with the exact durable
completed result; assert every listed attachment has one target-case evidence row with unique
attachment-ID storage identity and hash (or is explicitly partial/incomplete); assert the status
requested/completed generation advances once after persistence; assert one completed audit and no
per-email false manual-attachment note. Correlate KQL ordering from accept → validate → persist → status →
report. Do not synthesize the accept without operator authorization.

## Confidence + unread surfaces

**High** that the correct ticket verdict is PENDING. Every file in the TKT-145 ticket folder was read and
current live telemetry was queried. Unread live surfaces: PostgreSQL inbound/evidence/audit/note rows (not
retried after this verifier's two prior connection failures), Graph response bodies, queue message bodies,
and a deployment artifact hash proving exact source-to-live bundle identity. Focused tests were not rerun
because this verification worktree has no installed Vitest runtime.
