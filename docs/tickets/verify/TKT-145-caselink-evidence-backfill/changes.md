# Changes — TKT-145: Accepted case_link on a previously-uncased email must backfill its evidence to the case

## Status
code-complete + DEPLOYED (2026-07-10, feat/backlog-drain) — orch 72→73 (`evidence-backfill` queue
consumer), api 94→95 (`internalInboundEvidenceBackfill` report-back), the `evidence-backfill` queue
provisioned on `cespkorchstdev01`. Offline-proven (regression tests green). Live proof PENDING the
operator accept of staged suggestion **`025c8ce2-a4bf-4ed7-a57d-2c1a25231975`** (RE-STAGED
2026-07-10 16:39Z after the TKT-140 drain mooted the first, natural stage — see
[evidence/live-proof-staging.md](./evidence/live-proof-staging.md)).

## What was built (Shape B, queue-refined — as decided)

On a case_link **accept** of a previously-uncased, attachment-bearing inbound email, the Data API
now enqueues an **`evidence-backfill`** job (new storage queue on the orchestration storage account
`cespkorchstdev01`) **strictly after the link commit**; a new orchestration queue consumer re-fetches
the message from Graph and drives the **existing** persist chain onto the target case, then
re-evaluates status. The 2026-07-09 interim mitigation (an unconditional "attach by hand" case note)
is **inverted**: the note is now written only on **enqueue failure / missing mailbox provenance**
(API-side) or **terminal backfill failure** (consumer report-back) — never on a successful queue.

### api side (`cespk-api-dev`)
- **`services/data-api/src/features/assistant/register-suggestion-routes.ts`** — `promoteAcceptedSuggestion`'s case_link branch: the
  FILL-IF-EMPTY link UPDATE now also RETURNS `source_mailbox, source_message_id, subject`; when
  `has_attachments=true` it enqueues `{inboundEmailId, sourceMailbox, sourceMessageId, targetCaseId,
  subject}` (subject = the $search-fallback key) AFTER the UPDATE returned (each `query()` is its own
  auto-commit statement — there is no wrapping transaction). Enqueue failure or absent provenance →
  the pre-existing note text is written instead. All of it inside its own try/catch: **a backfill
  failure can never unwind or fail the accept** (the `return {promoted:true}` is unconditional on the
  link having committed).
- **`services/data-api/src/features/evidence/backfill-queue.ts`** (new) — `enqueueEvidenceBackfill` + the shared
  `EvidenceBackfillJob` shape.
- **`services/data-api/src/features/inbound/outlook-queue.ts`** — extracted the MI-token + Queue-REST POST into an exported
  `enqueueQueueMessage(serviceUrl, queueName, payload)`; `enqueueOutlookMove` delegates to it
  (error text `<queue> enqueue → <status>: …` preserved — `classifyEnqueueFailure` + its tests
  unchanged and green).
- **`services/data-api/src/features/`** — new `POST /api/internal/inbound/{id}/evidence-backfill`
  (withServiceAuth, the outlook-moved pattern): `completed` → case-scoped
  `attachment_classified` (100000002) audit, actor `orchestration`; `failed` → the durable
  **"Attachments to add"** note (same name/text as the mitigation, duplicate-guarded with
  `WHERE NOT EXISTS` on (case, name, text) against poison-path re-reports) + a
  `graph_message_ingest_failed` (100000001) warning audit.
- **`packages/domain/src/gates.ts`** — `evidenceBackfillQueueServiceUrl()`: reads
  `EVIDENCE_BACKFILL_QUEUE_SERVICE_URL` **falling back to `OUTLOOK_MOVE_QUEUE_SERVICE_URL`** (both
  queues live on the same account) — **no new live app-setting required**.

### orchestration side (`cespk-orch-dev`)
- **`services/orchestration/src/workflows/evidence/evidence-backfill.ts`** (new queue trigger, cloned from
  outlook-move.ts semantics):
  1. resolve the CURRENT Graph id via `findMessageByInternetMessageId` ($filter);
  2. fallback: whole-mailbox `$search` on the subject (gated **`RETRO_OUTLOOK_SEARCH_ENABLED`**,
     =true live; reaches Deleted Items), every candidate **corroborated on the exact
     internetMessageId** before use (`locateBySubjectSearch` — Graph $search cannot filter on
     internetMessageId, so subject is the search key and the id is the acceptance test; never a
     guessed message);
  3. `getMessageWithAttachments` (the TKT-047 signature/logo floor applies exactly as at intake) +
     best-effort raw `.eml` (`getMessageRawMime` + `rawEmlFileName`);
  4. `uploadEvidenceBytes` per attachment (sha256 hashed at landing — TKT-133's dedup key);
  5. the existing chain: `buildBaseEvidenceRows` (classifyPersist's exported row assembly) + the
     TKT-064 image-classify stamping (same `imageRoleClassifyEnabled` gate; the per-provider
     `ai_allowed` opt-out honoured via the TARGET case's provider — `dataApi.casesLookup` +
     `workProviderAiAllowed`, fail-open like classifyPersist; the case VRM from the same lookup
     constrains `registration_visible`) → **`dataApi.persistEvidence`** (the internal evidence
     route — **TKT-133's (case_id, sha256) dedup/LINK is relied on, not rebuilt**: replays,
     double-deliveries and a Graph-id change between attempts merge instead of duplicating);
  6. **`dataApi.evaluateStatus(targetCaseId)`** — the status recompute runs after the backfill
     (acceptance line 2);
  7. report-back `completed`/`failed` (`dataApi.reportEvidenceBackfill`). Retryable-vs-terminal
     split reuses `isRetryableGraphError` (5xx/429/network rethrow → queue redelivery, max 5
     dequeues; 4xx/not-found/last-attempt → terminal `failed` report → the note). A malformed job
     is logged + dropped (never poison-loops).
- **`services/orchestration/src/adapters/data-api.ts`** — `reportEvidenceBackfill` client (the reportOutlookMove
  pattern).
- **`services/orchestration/src/index.ts`** — registers the new module.

### Which gate governs what
- The enqueue + consumer are **ungated by design** (the accept itself is the human decision;
  recording evidence is record-keeping, the same reasoning as classifyPersist "always runs").
- `RETRO_OUTLOOK_SEARCH_ENABLED` (=true live) governs ONLY the $search fallback rung.
- `IMAGE_ROLE_CLASSIFY`(+model config) governs the image-role stamping, exactly as in the normal lane.
- Queue service URL rides `OUTLOOK_MOVE_QUEUE_SERVICE_URL` (escape hatch:
  `EVIDENCE_BACKFILL_QUEUE_SERVICE_URL`).

### Auth wiring (verified live 2026-07-10, ARM REST)
- Producer: api MI `51dcdd5f-…` already held **Storage Queue Data Message Sender** account-scoped on
  `cespkorchstdev01` → covers the new queue, **no new RBAC**.
- Consumer: orch host storage is identity-based on the same account; orch MI `ad47e928-…` holds
  **Storage Queue Data Contributor** account-scoped → trigger reads fine, **no new RBAC**.
- Report-back rides the existing orch-MI → Data-API audience token (`withServiceAuth`).

## Regression tests (all green: api 38 files/395 · orch 18 files/271 · domain 50/1076; `tsc -b` green ×3)
- `services/data-api/src/features/assistant/suggestion-generation-routes.test.ts` (+6): enqueue-after-commit ordering (the enqueue
  observes the inbound_email UPDATE already issued); exact job payload; **no note on successful
  enqueue**; note on enqueue failure (accept still succeeds); note when provenance is missing;
  nothing when `has_attachments=false`; **double-accept ⇒ no second enqueue** (idempotent re-review);
  FILL-IF-EMPTY miss ⇒ neither.
- `services/data-api/src/features/evidence/internal-backfill-routes.test.ts` (new, +8): failed → duplicate-guarded note
  + warning audit; completed → attachment_classified audit, no note; 400/404 contract edges.
- `services/orchestration/src/workflows/evidence/evidence-backfill.test.ts` (new, +9): happy path (rows all carry
  sha256 — the TKT-133 dedup key that makes double-accepts/replays yield **no duplicate evidence
  rows**; **status recompute ordered strictly after persist**; report completed); not-found →
  `failed` report, no throw; transient 503 rethrows for redelivery, terminal on last attempt; 403 is
  instantly terminal; the $search fallback uses only the id-corroborated candidate; malformed job
  dropped.
- Double-accept ⇒ no duplicate evidence rows is pinned at BOTH layers: the api layer (no second
  enqueue) and the evidence route (TKT-133, already pinned in `internal-evidence-dedup.test.ts` —
  **relied on, deliberately not rebuilt**, confirmed present in the deployed api bundle per the brief).

## Deploys (2026-07-10 — full detail in [evidence/deploy-2026-07-10.md](./evidence/deploy-2026-07-10.md))
- `evidence-backfill` queue **created** on `cespkorchstdev01` BEFORE the publishes (the TKT-091 lesson).
- orch published first: **72 → 73** functions; then api: **94 → 95**. Both apps Running (ARM);
  App Insights 20-min window clean; `VERIFY_LIVE=1 node verify-all.mjs` → registry drift **PASS**
  (Graph subscriptions 3 confirmed); the single suite FAIL is the pre-existing Windows-environmental
  parser pytest (untouched by this ticket).
- `LIVE_FACTS.json` (counts 73/95, new `storageQueues` fact, lastVerified 2026-07-10T10:25Z) +
  `docs/operations/live-environment.md` mirror updated.

## Staged live proof (operator step — NOT performed by the implementer)

> **RE-STAGED 2026-07-10 16:39Z.** The first stage (the natural suggestion
> `e1301dc9-5936-4507-b5ef-df8adb410aa3` on the EREF9 email → QDOS26023) was **MOOTED by the
> TKT-140 drain**: at 15:45:12Z the drain's rung-1 link cased that email, so its accept would hit
> the FILL-IF-EMPTY guard and do nothing (see Findings (c) below). Fresh discovery found NO other
> natural pending case_link on a still-uncased attachment-bearing email, so one was SQL-staged in
> the live rung's exact vrm-tier shape (+ the route's `inbound_link_suggested` audit), per the
> original brief's allowance. Full staging SQL, shape notes, readbacks + the drain-race caveat and
> backup pair: [evidence/live-proof-staging.md](./evidence/live-proof-staging.md).

The operator accepts, in the SPA inbox:
- suggestion **`025c8ce2-a4bf-4ed7-a57d-2c1a25231975`** (staged; audit twin `da5d3067-ee5d-4f89-b655-627d413373c6`)
  — on the uncased **desk@** email "Engineer Riage-Our claim REF: 46573/1- Vehicle registration:
  SW18EAY" (inbound_email `b958a35b-b32f-41c2-b49c-a1290e36bf00`, has_attachments=true,
  received 2026-07-02) → target case **A.QDOS26034**
  (`0b07b3d3-ecd6-49ed-9e35-a95e841aabf0`, VRM SW18EAY — the only open case with that
  registration; baseline: **24 evidence rows, 0 "Attachments to add" notes**, status `missing_images`).

### Post-accept verifier checks (run as Entra-admin + SET ROLE csadmin)
```sql
-- 1. the accept recorded
SELECT review_state, reviewed_by, reviewed_at FROM ai_suggestion
 WHERE id = '025c8ce2-a4bf-4ed7-a57d-2c1a25231975';            -- expect accepted
-- 2. the link
SELECT case_id, triage_state FROM inbound_email
 WHERE id = 'b958a35b-b32f-41c2-b49c-a1290e36bf00';            -- expect 0b07b3d3…, routed
-- 3. the backfilled evidence (baseline was 24 rows at staging time)
SELECT id, file_name, kind_code, sha256 IS NOT NULL AS has_sha, storage_path, created_at
  FROM evidence WHERE case_id = '0b07b3d3-ecd6-49ed-9e35-a95e841aabf0'
 ORDER BY created_at;                                 -- expect NEW rows created post-accept, sha256 set
-- 4. the audits (case feed)
SELECT name, action_code, actor, occurred_at FROM audit_event
 WHERE case_id = '0b07b3d3-ecd6-49ed-9e35-a95e841aabf0'
   AND action_code IN (100000036, 100000002, 100000013, 100000001)
 ORDER BY occurred_at DESC LIMIT 10;
-- expect inbound_linked (100000036, the accept) + 'Evidence backfilled from the linked email…'
-- (100000002, actor orchestration); 100000013 iff the recompute moved the status;
-- 100000001 ONLY on the failure path
-- 5. the inverted note semantics: NO new 'Attachments to add' note on success
SELECT count(*) FROM note WHERE case_id = '0b07b3d3-ecd6-49ed-9e35-a95e841aabf0'
   AND name = 'Attachments to add';                            -- expect 0 (baseline 0)
```
App Insights (cespike-parser-ai-dev): `traces | where message has "evidence-backfill"` — the
consumer's completion event carries `persisted` + `status`. Double-accept safety can be re-proven by
re-POSTing the review (idempotent `promoted:false`, no second enqueue). (The mooted `e1301dc9`
accept, if clicked anyway, is a harmless no-op — see Findings (c).)

## Findings the brief asked for
- **Auto-attach seam (TKT-093): NOT wired for backfill — not applicable by construction.** The
  auto-attach lives in `internalTriageSuggestLink` (`autoAttach:true`, internal.ts) and fires only
  from the `triagePolicy` activity **during intake of that same email**; the orchestrator's
  `attach_case` branch then runs `classifyPersist` + `extractImages` inline for it
  (intakeOrchestrator.ts), so an auto-attached email's evidence is persisted in the same run —
  it can never be a *previously-uncased* attach. Every seam that attaches a previously-uncased email
  goes through `promoteAcceptedSuggestion`'s case_link branch (grep-verified: the only other
  `inbound_email SET case_id` writers are the case-merge reparent — both cases already own their
  evidence — and the detach which sets NULL). The TKT-084 pre-instruction correlations also land as
  case_link suggestions → the same covered accept seam.
- **Orphan evidence rows class: does not exist — no dead code built.** `evidence.case_id` is
  `NOT NULL` (database/baseline/060_evidence.sql), so no evidence row can exist unattached;
  the non-minting lanes skip classifyPersist entirely (no rows are ever created uncased), and an
  email already on a Held/placeholder case cannot re-link through this seam (the accept's
  FILL-IF-EMPTY `WHERE case_id IS NULL` guard). Re-pointing logic was therefore deliberately not built.
- **(c) Accepting a suggestion whose email is ALREADY linked (even to the SAME case) does NOT
  backfill.** The case_link branch's UPDATE is guarded `WHERE id = $1 AND case_id IS NULL`
  (ai-suggestions.ts); when the email is already linked it returns no row, so the entire block —
  attach audit, chaser hook, **backfill enqueue**, note — is skipped and the review returns
  `promoted:false` (the accept is still recorded on the suggestion). A drain-mooted accept is
  therefore a harmless no-op — which is exactly why the e1301dc9 stage had to be re-staged rather
  than left for the operator.

## Out-of-scope discoveries (recorded, not acted on)
- **Cousin gap — the DRAIN-LINK lane attaches previously-uncased emails WITHOUT evidence backfill
  (new-ticket candidate).** TKT-140's retro ladder rung-1 (`retroResolveExisting` →
  `/api/internal/retro/resolve-existing`) linked **37** previously-uncased emails to existing
  cases on 2026-07-10 alone — the same gap class this ticket fixed for the ACCEPT seam: the
  rung-1 link stamps `inbound_email.case_id` but never re-drives the landed attachments into
  evidence (it even mooted this ticket's first staged live proof by casing the EREF9 email at
  15:45:12Z, whose attachments are now linked-but-not-backfilled on QDOS26023). The
  **already-deployed `evidence-backfill` queue + consumer can serve this lane directly** — a
  small driver enqueueing `{inboundEmailId, sourceMailbox, sourceMessageId, targetCaseId,
  subject}` for retro-linked attachment-bearing emails (either inside the API's
  retro/resolve-existing link path, mirroring the accept seam's enqueue-after-commit, or as a
  one-shot sweep over `triage_state='routed'` rows linked by the drain). Not built now — scope
  discipline; flagged for a follow-up ticket.
- **PDF-embedded photos**: the decided TKT-145 chain ends at persist + status recompute — it does
  NOT run `extractImages`, so photos embedded INSIDE a backfilled PDF (the common Tractable shape)
  are not exploded into image evidence rows on this path (the PDF itself IS persisted). Parity seam
  for a follow-up ticket.
- **Box archive parity**: the backfill does not run `boxArchiveEvidence`, so backfilled blob-backed
  rows are not mirrored into the case Box folder until another lane triggers an archive for that
  case. Also a follow-up parity seam.
- The plain `az functionapp show --query state` returns EMPTY for these FC1 apps — use ARM
  `properties.state` (recorded in the deploy evidence; worth a memory/playbook line).

## Files touched
- `services/data-api/src/features/assistant/register-suggestion-routes.ts` · `services/data-api/src/features/`
- `services/data-api/src/features/evidence/backfill-queue.ts` (new) · `services/data-api/src/features/inbound/outlook-queue.ts`
- `packages/domain/src/gates.ts`
- `services/orchestration/src/workflows/evidence/evidence-backfill.ts` (new) · `services/orchestration/src/adapters/data-api.ts`
  · `services/orchestration/src/index.ts`
- Tests: `services/data-api/src/features/assistant/suggestion-generation-routes.test.ts` ·
  `services/data-api/src/features/evidence/internal-backfill-routes.test.ts` (new) ·
  `services/orchestration/src/workflows/evidence/evidence-backfill.test.ts` (new)
- Registry: `LIVE_FACTS.json` · `docs/operations/live-environment.md`
- Ticket: this file · `verification.md` (non-verdict sections) · `evidence/live-proof-staging.md`
  · `evidence/deploy-2026-07-10.md`

Committed on `feat/backlog-drain` (2026-07-10); hash in the dispatch report.

## Regression follow-up

- [2026-07-11 queued-backfill correctness and durability](./changes-regression-11-07-26.md)
