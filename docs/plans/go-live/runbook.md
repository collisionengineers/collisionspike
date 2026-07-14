# Go-live cutover runbook

This is the **future ordered cutover specification**, not a currently runnable procedure. Existing mechanics
may include illustrative commands, but commands and artifacts for the missing Precondition-0 capabilities are
intentionally absent until they are implemented, independently reviewed and rehearsed. Only that exact
versioned release can turn the specification into an executable runbook. Live numbers, gate values and
function counts are **not** re-embedded here — read them from the registry
[`docs/architecture/live-environment.md`](../../architecture/live-environment.md) (single source
[`LIVE_FACTS.json`](../../../LIVE_FACTS.json)) at cutover time.

Companion docs in this set: **[readiness-matrix.md](./readiness-matrix.md)** (every gate × target ×
owner), **[day0-smoke.md](./day0-smoke.md)** (the post-cutover smoke), **[rollback.md](./rollback.md)**
(back-out). The maintained operator inventory is
[`docs/gated.md`](../../gated.md); the sprint that produced this is
[`GO_LIVE_SPRINT_PLAN.md`](./README.md).

> **BLOCKED FUTURE RUNBOOK — no live cutover is authorised.** TKT-178 requires one approved input pack
> containing all three global inputs: the signed/checksummed job spreadsheet; a successful authenticated,
> contract-verified production EVA API probe; and the exact production Archive root with proven explicit
> write/rename/merge/retarget authority. It also requires backup/restore proof, a frozen approved zero-write
> ledger hash and a named live window. Until all of them pass, do not run any production Archive root/write,
> Case/PO floor/renumber or EVA reconciliation command below. Manual EVA drag-drop and test, mirror,
> configured-default or Viewer-only Archive roots are not substitutes.
>
> **Command text is not mutation authority.** This planning pass authorises no live change, including the
> unrelated PAYG, app-role and provider-corpus steps below. Every mutation needs its own explicit operator
> approval. TKT-178 mutations additionally require the named run ID, signed ledger/hash, exact approved
> artifact hashes, named window and live fence token; executors must verify them fail closed. Otherwise this
> document is read-only. Do not renew/create/delete Graph subscriptions, call an ad hoc retro starter, mutate
> Outlook, create a case manually, write database/Archive/configuration state, or call/submit EVA from this
> document. Rollback authority is separately limited to the approved inverse journal.

## Precondition 0 — missing cutover capabilities must be built and proved offline

This plan-hardening pass does **not** build or deploy these. No live window can be requested until each has
an independently reviewed contract, production-shaped offline tests and a fail-closed feature boundary:

1. **Signed job-sheet importer.** The existing `jobsheet-import` activity is an audit stub; it does not open
   a spreadsheet. The future importer must validate the supplied workbook/export against an operator-approved
   sheet/column schema, reject formulas/errors/duplicate identities/unknown principals, retain the exact raw
   file SHA-256, and emit a stable canonical row serialization and hash without writes.
2. **Production EVA reconciliation reader.** `eva-report-poll`/`GetAvailableReports` is a dark no-op skeleton.
   Implement authenticated per-principal report/case reads, pagination and contract validation so every
   scoped ledger row receives a recorded EVA result; a token or submit-only probe is not sufficient.
3. **Durable EVA submission idempotency.** Replace/prove beyond the current process-local cache with persisted
   operation state and vendor idempotency/correlation or status-before-retry semantics across recycle and
   response loss.
4. **Complete database merge/inverse service.** The current case merge moves only a subset of relationships.
   Before cutover it must either move every TKT-178 relationship (notes, chasers, provenance, signals, audit,
   vehicle/evidence/email links and later additions) or preserve the retired source as traversable lineage;
   the scoped inverse must be proven.
5. **Production Archive executor.** The current Box facade has no rename/move/merge route. Build a narrowly
   scoped executor/tool contract with object-id and before-state preconditions, content-hash collision
   refusal, per-action checkpoints and tested inverses. It may address only frozen-ledger objects beneath the
   exact approved roots. Add a canonical read-only metadata operation for an exact object ID that returns its
   immutable ID and `parent.id`; child listing/name matches cannot prove placement. Make a missing/blank
   `BOX_ALLOWED_ROOT_ID` fail closed—the current facade treats absence as a lifted lock, which is never an
   approved production mode.
6. **Deterministic artifact compiler and write fence.** Generate floor SQL and action artifacts from the
   canonical ledger/run id with no wall-clock text; hash and execute the exact approved bytes. The existing
   folder-name helper's date-bearing raw-name output is advisory only. Provide the scoped writer/allocator
   fence and durable queue checkpoint/resume required by TKT-178 A16.
7. **Version-locked release and prerequisite verdicts.** Publish one independently reviewed dependency
   manifest that classifies every related ticket as a hard gate, evidence-only or post-cutover item and records
   its owner/verifier/verdict. Pin the exact git commit, schema migration IDs/checksums, API/orchestration/
   Archive package hashes, compiler/executor hashes, config snapshot and EVA contract version used in the
   rehearsal. TKT-004, TKT-009, TKT-052, TKT-094, TKT-095, TKT-158, TKT-175 and TKT-177 are hard gates:
   each needs an independent verified verdict and none may remain `blocked`, `backlog` or `verify`.
   Window-start readback must match the manifest byte for byte; code, schema, config or vendor-contract drift
   invalidates approval.
8. **Canonical Case/PO batch mapper and fail-closed floor mode.** The existing one-case `PATCH` route cannot
   atomically execute swaps/cycles, and the allocator currently falls back to DB max when a floor read fails.
   Build the locked multi-row mapping service and make floor health mandatory for every mint while any
   historical floor is authoritative. A prefix may graduate only after a separately proved invariant shows
   its persisted database maximum is at or above the approved floor; elapsed time or “first mints passed” is
   never sufficient.
9. **Production-webhook staging and Box-event fence.** The current Archive facade rejects webhook creation
   outside its current mirror write root, while an active `FILE.UPLOADED` callback writes evidence/status
   synchronously. Implement a versioned exact-destination staging operation bound to the signed run, exact
   target and fence token without widening general scope. The receiver must acknowledge and durably buffer
   production-destination events, preserving order/idempotency, without evidence/status writes until release;
   prove checkpoint, replay and rollback before a window request.
10. **Source-bearing Graph renewal telemetry.** Current `graph-renewal-success` messages are ordinary traces
    emitted identically by durable, manual-HTTP and timer paths, so text alone cannot certify an unattended
    renew. Emit a versioned custom event with `source=durable_monitor|manual_http|timer_backstop`, durable
    instance/invocation ID, subscription ID and next expiry; tests and KQL must prove the durable source after
    the latest manual call.

> **Platform routing.** `az` / `psql` run from **WSL2 Ubuntu** (az logged in there); Exchange-RBAC admin
> is **Windows PowerShell**; Box CLI + git + node run on **Windows**. State the platform per command.

---

## Precondition — data correction (IN-PLACE reprocess), not a mailbox wipe

The DB is the **complete record** (the intake Inboxes hold only ~⅓ of the processed emails — the rest
are in Deleted Items), so the go-live data-correction step is an **in-place reprocess** of the existing
rows through the fixed classifier — **NOT** a mailbox wipe-and-rebuild (that was proven non-viable and
abandoned). This reprocess is **BLOCKED on the P2 classifier fix-wave** (a naive reprocess-diff
mis-demotes obvious new-work because `evidence.source_message_id` is always NULL). Do **not** begin the
cutover below until the reprocess has run green and the SPA shows correct data — see
[`GO_LIVE_SPRINT_PLAN.md`](./README.md) (P2 → P3 in-place reprocess → P3V). Until
then this runbook is provisional.

---

## 1. Subscription on Pay-As-You-Go — *hard dated deadline; do first*

Azure portal → **Subscriptions → `e6076573-…` → Upgrade** (or **Cost Management + Billing**), convert
the Free Trial to **Pay-As-You-Go**; the 12-month free Postgres allowance survives. Until this is done
the whole stack disables at the ~30-day trial mark and every step below is provisional
([gated.md A1](../../gated.md)).

**Verify:** `az account show` prints subscription `e6076573-…`, state **Enabled**, and quotaId is no
longer `FreeTrial_2014-09-01`.

## 2. Staff app-role roster ([gated.md C1](../../gated.md))

Only one staff principal is app-role-assigned; everyone else `403`s until assigned.

- Entra → **Enterprise applications** → the API app (`cespk-api-dev` / `CollisionSpike`, v2 `aud` =
  API client-id `fa2fb28c…`) → **Users and groups → Add user/group**.
- Assign **`CollisionSpike.User`** to each staff member (**`CollisionSpike.Superuser`** for
  full-privilege admins). Do **not** assign `CollisionSpike.Engineer` (defined, not enforced).

**Verify:** each person signs out/in and loads the SPA
(`https://proud-sky-04e318b03.7.azurestaticapps.net`) without a `403`.

## 3. Provider corpus completion ([gated.md D3/D4](../../gated.md))

Fill the remaining domainless providers and the **PHA (Parkhouse) principal code** so sender-domain
auto-matching is complete before intake volume ramps.

- Operator supplies the real business domain (or "none") for the remaining providers (Fairway, Regent,
  Castle, Stallion, Relay, …) and the public-domain case (NETWORK HD UK / YM Law → `gmail.com`), plus
  the **PHA principal code** (its insert is held commented in
  `migration/assets/schema/seed/916_provider_domain_corrections.sql`).
- Apply as a reviewed additive seed delta via the **[postgres.md](../../azure/postgres.md)** runbook
  (transient firewall rule → Entra `digital@` → `SET ROLE csadmin` → `\i` the delta → drop the rule).
  Domains serving >1 active provider must stay ambiguity-guarded (intermediary path, never a match key).

**Verify:** the delta's header SELECTs show each provider's `known_email_domains` populated and the PHA
row active; corpus count moves in the registry
[`live-environment.md`](../../architecture/live-environment.md).

## 4. Zero-write cutover reconciliation and approval — BLOCKED before any live window

The live mint restarted near 001 after the 2026-06-30 reset while historical numbering is far ahead. This
section is read-only planning, not authority to execute. Complete it before requesting a production window:

1. **Prove implementation readiness.** Independently verify every hard dependency and the exact versioned
   manifest from precondition 0. A blocked/backlog/verify hard dependency, local modification, artifact drift,
   dark stub or missing capability stops here. Require the versioned source-bearing custom event and a recent
   `graph-renewal-success` with `source=durable_monitor` after the most recent `manual_http` event; current
   undifferentiated trace text is not proof, and any manual call resets the gate.
2. **Load the roster authority.** The signed/checksummed operator-approved job sheet alone defines active-job
   membership at the snapshot. EVA, Archive and read-only Outlook can corroborate identity, prove completion
   and supply historical-number evidence; they cannot silently add, remove or override a roster row.
3. **Read and reconcile the closed-world union.** Without writes, inventory every sheet row; every scoped DB
   case and relationship including completed, held, unnumbered, retired and merged lineage; every object
   beneath each approved source/destination Archive root; every authenticated paginated EVA case/report
   result; and each Outlook item actually used as evidence. Outlook remains read-only: no send, move, delete,
   category or read-state change. Record immutable Archive object and parent IDs plus names/hashes. Every
   source-only member receives an explicit held/out-of-scope disposition, reason and named approver.
4. **Compile Case/PO actions.** Follow
   [`case-po-sequence-cutover.md`](../case-po-sequence-cutover.md): compute each prefix floor from every valid
   historical allocation, compile the complete target-occupancy/collision graph, and plan chains/swaps/cycles
   for the canonical batch mapper under exact-old-value/version predicates. An unresolved source that could
   hide a higher number blocks that prefix.
5. **Build the deterministic zero-write ledger.** Record every current/proposed identity, action/no-op,
   exact precondition, expected post-state, typed checkpoint and inverse. The future compilers generate SQL,
   database mapping components and Archive actions from the canonical ledger/run ID with no wall-clock text.
   The raw folder-name helper is advisory only.
6. **Back up and rehearse.** Capture checksum-verified database/Archive/queue manifests, prove restore and
   every scoped inverse off-production, and rehearse response loss, conflicts, Case/PO cycles, Archive rename
   cycles and interruption recovery. Freeze exact executor/deployment/config/schema/vendor versions.
7. **Nominate two genuine canaries without writing.** Read-only nominate (a) one still-pending ingress
   instruction by mailbox/message/queue IDs to prove intake/mint/root placement, and (b) one pre-existing
   EVA-ready case whose approved photos and staff decisions are complete, has never had this API submission,
   and needs no claimant/staff wait. Record both in the ledger without changing visibility, queue or case
   state. They must be two distinct objects with two distinct one-shot leases: a still-pending instruction
   cannot also be the pre-existing completed EVA-ready case. If either candidate is unavailable, postpone.
8. **Approve, then request a time-bounded window.** Hash the source manifests, ledger, collision graph,
   ordered dry run, inverse journal, canary nominations and exact artifact bytes. A named approver signs those
   hashes plus an absolute UTC deadline/maximum fence duration before—not during—a separately requested
   window. A roster change requires a newly signed/checksummed sheet amendment and regenerated approval; a
   disposition cannot override roster membership.

**Verify:** an independent reader can reproduce every hash and 100% union balance from retained read-only
evidence. Authenticated EVA populated every scoped row; exact Archive IDs/parents are recorded; all hard
dependencies and artifacts match the manifest; both canaries are only nominated read-only; no production
mutation occurred.

## 5. Fenced execution, Archive reconciliation and final root commit — BLOCKED future window ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md))

`RETRO_CASE_ENABLED=true` already (rung-1 any-status linking is acting) and is not the production cutover.
An existing lookup root, Viewer grant or folder listing is not production write authority. Start this section
only after section 4 is signed and the separately named window is open.

1. **Engage and prove the scoped fence.** Fence every ledger-scoped database case/relationship and Archive
   object, both allocators, manual/API/admin case creation and every worker able to mutate scoped principals.
   Keep Graph and Archive webhook acknowledgement/durable enqueue plus Graph subscription renewal alive. Hold
   all new Graph and production-destination Archive events durably behind the fence without evidence/status
   writes, preserve ordering, and record queue/outbox high-water marks and drain checkpoints. Prove the two
   lease mechanisms remain unissued at this point.
2. **Revalidate the approved snapshot.** Read the window-start delta and exact deployed code/schema/config/
   vendor versions. Recheck every checksum, count, immutable ID, exact-old-value/version predicate, target
   occupant and artifact hash. Atomically claim the exact nominated ingress ID and reserve the exact ready
   case by immutable ID/version only after the fence exists. Only after both candidates pass that fenced
   revalidation may the operation ledger issue their two distinct one-shot leases. If either claim,
   reservation or lease issue fails—or the deadline passes—revoke/expire every issued token, close the window
   before cutover mutation and obtain a new dry run and approval.
3. **Authorise only exact Archive objects.** The future executor allowlist contains the ledger-listed source
   object IDs and approved destination IDs—nothing else. If the scope mechanism cannot express exact sources
   and destination, abort; never select a broader common ancestor. Keep the Box Function and both app mint-root
   settings at their pre-window values while content and database actions run.
4. **Execute the approved per-row sagas.** Apply the exact hashed floor SQL and canonical batch Case/PO
   components, database merges/status/relationship actions and Archive moves/renames/merges in each ledger
   row's pre-approved order. Push every successful typed checkpoint onto the durable inverse stack. Preserve
   unique bytes, notes and links; treat a verified `mergedInto` lineage after response loss as idempotent
   success; stop on collision, missing bytes, newer content or drift and never blindly retry a `409`.
5. **Verify content and data before retargeting.** Prove every DB invariant and every Archive object's exact
   immutable ID, parent ID, name and hash against the signed ledger. A root name/listing is insufficient.
   Keep the canary and all ordinary queued work held.
6. **Stage and independently read back the exact File Request/webhook before the root commit.** The template
   must already be built and proven inside the approved test/mirror scope. Record both apps' exact prior
   template values, then set the approved template ID. Through Precondition-0's exact-target staging operation
   and active Box-event buffer—never the current unrestricted facade—verify/preserve an exact pre-existing
   production-destination subscription or create it only from proven prior absence. Journal immutable webhook
   ID, target, callback and `created_by_run`. Before proceeding, independent provider `GET` plus app-setting
   readback must byte-match those approved values and prove any production event is durably held without a
   database/status write. A staging rejection or unfenced event aborts before the roots change. Any approved
   reconstruction-root settings are staged and journaled here; Outlook remains read-only and no retro starter
   is enabled or invoked.
7. **Commit the production mint root last** (WSL; do not run now). First narrow the Box Function's fail-closed
   scope to the exact destination root—never clear it—then set API and orchestration mint roots:
   - `az functionapp config appsettings set -g rg-collisionspike-dev -n cespkbox-fn-v76a47 --settings BOX_ALLOWED_ROOT_ID=<approved-prod-root-id>`
   - `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-api-dev --settings BOX_FOLDER_ROOT_ID=<approved-prod-root-id>`
   - `az functionapp config appsettings set -g rg-collisionspike-dev -n cespk-orch-dev --settings BOX_FOLDER_ROOT_ID=<approved-prod-root-id>`
   Record exact prior values, config diffs, recycle/health results and inverses. Abort and restore all three on
   any mixed readback. Do not release work yet.
8. **Hold at the pre-canary checkpoint.** Reverify DB/Archive/config/queue invariants and both exact canary
   identities. Proceed to steps 6–7 below while the global fence remains held. Ordinary workers, allocators
   and manual creation resume only after the ingress canary proves root placement and the ready-case canary
   passes authenticated EVA hard-green within the approved deadline.

**Failure before EVA dispatch:** keep the fence and execute only the approved LIFO inverse journal in
[rollback.md](./rollback.md). After EVA dispatch/accepted-or-unknown response, use forward recovery as step 7
defines; never broaden Archive scope or pretend the external business event was erased.

## 6. Post-root confirmation of the pre-root File Request + production webhook gate

The template and production-target webhook are hard TKT-178 configuration prerequisites staged and
independently read back in step 5.6 before the final root commit—not follow-up mutations after it. This
section repeats the same read-only checks after the three-root commit; it cannot repair or substitute for a
missing pre-root gate.

**Verify before releasing canaries:** both apps return the approved template ID; provider metadata for the
production subscription returns its immutable ID, exact approved destination target and callback; the journal
distinguishes a pre-existing subscription from one created by this run. The already-live mirror subscription
does not satisfy this production-target check. Production upload receipt is observed later on ordinary genuine
work; do not make the bounded cutover wait for a claimant upload or manufacture one for proof.

## 7. Production EVA API reconciliation — BLOCKED cutover must ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md))

**EVA REST is currently blocked** (`EVA_API_ENABLED` absent) because Minotaur's Sentry API accepts only
one principal code per submission. That blocker keeps the whole TKT-178 cutover blocked. Staff may keep
using drag-drop export for ordinary case handling, but it cannot prove the production reconciliation and
must not be used as a cutover substitute.

Authenticated non-mutating EVA reads for every scoped row, the signed-sheet reconciliation and contract
version were already frozen before the window in step 4. If any is absent or differs, close the window without
releasing the canary.

1. **Prove durable submission semantics.** The persisted operation record and vendor-supported
   idempotency/correlation or status-before-retry contract must survive worker recycle and response loss. The
   current in-process cache is insufficient.
2. **Exercise the ingress lease exactly once.** Admit only the claimed message and its resulting case through
   the normally fenced paths named by its one-shot token, including exactly one Case/PO mint and Archive
   folder creation. All ordinary traffic stays blocked. Prove the database folder ID via canonical metadata:
   parent ID equals the approved root and name equals Case/PO. No claimant upload is required in this window.
3. **Mark the pre-EVA checkpoint.** Before dispatch, every pre-existing database/Archive/config action remains
   eligible for the approved LIFO inverse journal. Record the ready-case payload hash, persisted operation ID and current
   provider status.
4. **Exercise the ready-case EVA lease once.** The pre-existing genuine case must still be complete with no
   outstanding staff/claimant input. The photo-order rules remain mandatory: two previews first, then all photos
   including those two again; full registration visible on the overview; reflected people excluded.
5. **Respect the irreversible commit point.** Once the first production submission is accepted—or the
   response is lost and acceptance is unknown—do not blind-resubmit and do not reverse identity-bearing
   Case/PO/Archive state as if the business event never happened. Query by persisted correlation and recover
   forward. Vendor/business compensation requires separate explicit authorization.
6. **Release the fence only after hard-green and before the deadline.** The ingress canary must have exact
   Archive ID/parent/root proof and the ready-case canary must have an authenticated EVA outcome; both share
   the same run/ledger and require database/audit integrity and healthy queue/config readbacks. Then resume
   allocators/workers from their recorded checkpoints and drain held work idempotently in order.

**Verify:** retained evidence ties the authenticated production response, signed spreadsheet, exact approved
Archive root, both immutable canary identities and persisted operation to the same approved ledger/run.
Archive and EVA are mandatory green results; manual drag-drop, an explained amber or a sent-only Outlook item
is not a pass. Deadline/eligibility failure before EVA dispatch uses the canary-preserving compensation path.

## 8. Day-0 smoke

Run **[day0-smoke.md](./day0-smoke.md)** against the same two immutable journaled canaries (no synthetic
production email, case or upload): ingress → provider match → parse → exact approved production Archive
   folder, plus the already-ready case's authenticated production EVA API result. Confirm the versioned
   source-bearing custom event shows a recent **`source=durable_monitor`** renewal after the latest
   `manual_http` event; the current shared trace message is not proof. Graph subscription expiries are in the
   registry.

## 9. Rollback

Before EVA dispatch, a failed verify follows the approved typed LIFO inverse journal in
**[rollback.md](./rollback.md)** while the fence stays held. Manual/API/admin case creation remains blocked
until rollback completes and queue/config invariants pass. After EVA acceptance or an unknown response,
identity-bearing recovery is forward-only unless separately authorised; no document command makes every
external business event reversible.

---

**After any live change here:** update [`LIVE_FACTS.json`](../../../LIVE_FACTS.json) (bump
`lastVerified`) + the [registry mirror](../../architecture/live-environment.md), then
`VERIFY_LIVE=1 node verify-all.mjs`.
