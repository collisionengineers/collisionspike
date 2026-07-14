# Verification — TKT-146: Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26 (verdict block transcribed 1:1 below; orchestrator
data-pass W1 results appended).

## Evidence (implementer-gathered, 2026-07-10)

**Acceptance line 1 — a Box-uploaded vehicle image carries a role + registration_visible shortly
after upload (live proof on the test area):**
- [evidence/upload-receipt.json](./evidence/upload-receipt.json) — facade `upload_file` into the
  test area (`All Files / test folder 392761581105 / A.PCH26036 398564730902`): file
  `TKT146-liveproof-112816.jpg`, Box file id **2338959990817**, `outcome: created`,
  2026-07-10T11:28:16Z. (Bytes = the case's own classified overview 2338884169413 with a 16-byte
  tail appended so the TKT-133 sha dedup could not absorb the upload; case VRM SP23OBX.)
- [evidence/stamped-row.txt](./evidence/stamped-row.txt) — evidence row
  `37bbb92a-262c-488c-8347-8e2b0a968324`: registered 11:28:19Z as role `unknown(100000003)` /
  `registration_visible NULL`; stamped **`image_role_code=100000000 (overview)` +
  `registration_visible=true`** at `updated_at` 11:30:09Z — **stamp latency 00:01:50** (≤ one
  5-min sweep period). The row also carries `person_reflection=true → excluded=true /
  accepted_for_eva=false` — the TKT-064 person-reflection domain rule acting on this photo, not a
  failure.
- [evidence/kql-sweep.txt](./evidence/kql-sweep.txt) — orch App Insights
  `boxClassifySweep.stamped` trace for that evidenceId (`role: overview,
  registrationVisible: true`) plus the first sweep summary
  `enumerated:25 classified:25 stamped:25 failed:0 casesReEvaluated:6 ms:189199` and the
  backlog draining (242 → 227 across the proof window).

**Acceptance line 2 — failures fall back to role unknown without blocking registration:**
- Registration is untouched by design: the row was registered by the box-webhook BEFORE any
  classify (pre-state captured in stamped-row.txt / upload-receipt.json) and the sweep only ever
  UPDATEs metadata via the evidence route's update-in-place path.
- Offline pins (orchestration vitest, 284/284 green): `box-classify-sweep.test.ts` case (c) — a
  classify null AND a facade throw each leave their row unstamped (role unknown) while the rest of
  the sweep completes; case (d) — enumeration failure warns and returns; the sweep never throws.
- Live corroboration: first sweep summary `failed:0`; 0 exceptions / 0 5xx on both App Insights
  components in the 30-min post-deploy window.

## Pending / gaps
- Verifier certification of the two acceptance lines against the evidence above.
- The 242-row backlog was mid-drain at proof time (227 at last read) — a later read should show it
  near 0 (minus any persistent AOAI content-safety refusals, which age out of the 14-day window).
- FC1 caveat (recorded): a scaled-to-zero orch app defers the tick to its next wake (past-due
  catch-up); intake push traffic + the durable monitor's ~6h wake bound this in practice.

## How to re-verify
1. Upload a vehicle image via the Box facade `upload_file` op into a case folder under root
   392761581105 whose case has a VRM (mutate bytes if cloning an existing file, or use a fresh
   photo).
2. Within ~5 min (app awake), check the evidence row (WSL Entra-admin psql + `SET ROLE csadmin`,
   transient FW rule, trap-delete after):
   `SELECT image_role_code, registration_visible, accepted_for_eva, excluded, updated_at - created_at
    FROM evidence WHERE box_file_id = '<new box file id>';`
   — expect a role code + boolean registration_visible.
3. KQL (orch component `7c7ea68a…`):
   `traces | where message contains "boxClassifySweep" | where message !contains "Found the following functions" | order by timestamp desc`
   — expect `.stamped` lines + per-sweep summaries with `failed` staying low/0.
4. Idempotency: re-run the sweep window — an already-stamped row (boolean registration_visible)
   must never be re-enumerated (the route's `registration_visible IS NULL` predicate).

---

## Ticket-verifier verdict (transcribed 1:1, dispatch of 2026-07-10)

### Verdict
**VERIFIED-LIVE**

Both acceptance lines are proven against the live stack by my own reads (deployed surface + orch App
Insights KQL on the correct component `7c7ea68a…`). The one artifact I could not personally execute —
an independent Postgres re-read of the exact test row — is queued below for the orchestrator data pass
(firewall-window constraint by design), but the live sweep mechanism and the never-throws fallback are
both independently confirmed, and the specific row is authoritatively backed by the system-of-record DB
capture the implementer took.

### Evidence
- **Deployed surface (az functionapp function list, WSL, read-only):** `cespk-orch-dev` → 74 functions,
  `box-classify-sweep` present; `cespk-api-dev` → 96 functions, `internalEvidenceUnclassifiedBox`
  present. Matches registry.
- **Acceptance line 1 (live mechanism, verifier's own KQL, orch component
  `7c7ea68a-d14f-4196-ae58-d83711b7eb2a`):** 119 `boxClassifySweep.stamped` traces between 11:50:54Z
  and 12:15:48Z — the sweep actively classifies Box-lane images and stamps roles +
  `registrationVisible` booleans live (24–25 stamped/sweep during the drain). The specific test row
  (system-of-record): evidence `37bbb92a-262c-488c-8347-8e2b0a968324` → `image_role_code=100000000
  (overview)`, `registration_visible=t`, stamp latency 00:01:50. The `person_reflection=t →
  excluded=t / accepted_for_eva=f` on this row is the TKT-064 domain rule acting, not a failure. The
  pre-11:50Z traces (incl. the 37bbb92a stamp trace) have aged out of the queryable App Insights store
  — ingestion/sampling + FC1 scale-to-zero artifact, not a defect; the DB row is authoritative.
- **Acceptance line 2 (live + code):** evidence `f43ff684-dfe6-41f3-aa21-f9a9eecd0502` logs
  `boxClassifySweep.classifyNull` on every sweep — classifyImage returned null (AOAI
  content-safety-refusal class), the row is counted failed++ and left role-unknown, the sweep completes
  normally each tick; the registration row is never deleted or blocked (stays enumerable, retried until
  the 14-day window ages it out) — positive live evidence of the never-throws fallback. Code:
  `image-classify.ts` `classifyImage()` returns null on any failure and never throws (139–169);
  `box-classify-sweep.ts` per-row try/catch, classifyNull → failed++ + continue (167–175), per-row
  catch (193–202); the stamp path only UPDATEs metadata in place. Offline pins: orch vitest 284/284.
- **No error burst (KQL):** only orch exception type since 11:00Z is the pre-existing graph-webhook
  Kestrel `BadHttpRequestException` cold-start residual (6), already registry-documented.
- **Backlog drain (KQL):** enumerated per sweep 25 → 25 → 25 → 7 → 1 → 1 → 1 → 1 (11:53Z→12:45Z) —
  the ~242-row backlog drained to a single persistently-failing residual.

### Pending / gaps
- Expected, not bugs: the f43ff684 classifyNull residual (bounded, retried ≤1 row/5 min, ages out at
  14 days) — this IS the never-throws fallback working; the pre-11:50Z App Insights trace gap
  (telemetry retention); the graph-webhook Kestrel residual (pre-existing).
- Optional SPA spot-check queued (browser profile locked at dispatch time; non-gating — acceptance
  line 1 is a data-layer assertion, already proven).
- FC1 caveat (recorded): "event time" = within one sweep period while the app is awake; a
  scaled-to-zero orch app defers the tick to its next wake (past-due catch-up), bounded by intake push
  traffic + the durable monitor's ~6h wake.
- No real bugs found.

### Confidence + unread surfaces
High confidence. Unread: live Postgres this pass (queued, below), the aged-out stamp trace (DB row +
119 live same-shape stamps relied on instead), the SPA render (non-gating).

## Orchestrator data-pass W1 (2026-07-10, batched transient-FW window, trap-deleted — only AllowAzureServices remains)

All three queued checks confirmed the verifier's predictions:

- **(a) exact-row re-read:** `37bbb92a-262c-488c-8347-8e2b0a968324` → `image_role_code=100000000`,
  `registration_visible=t`, `excluded=t`, `person_reflection=t`, `stamp_latency 00:01:50.025426`. ✓
- **(b) sweep backlog now:** `1` (the f43ff684 classifyNull residual, exactly as predicted). ✓
- **(c) idempotency lockout:** `classified_box_rows_locked_out=2116`, `still_enumerable=1` — every
  stamped row carries a non-null registration_visible and is excluded from re-enumeration. ✓

## Regression verification — 2026-07-11

**Verdict: TESTED (offline) — deployment pending.**

This block supersedes the stale `VERIFIED-LIVE`/done verdict for the PR 55 retry/starvation repair.
The prior upload and backlog drain remain evidence for the older deployed sweep only.

- Provider-permission uncertainty now fails closed before image bytes can reach the model. Opted-out
  rows are filtered before the page cap, and durable claims use `SKIP LOCKED`, tokens, leases, due
  times and terminal dead letters so failing rows cannot monopolise the batch.
- The 14-day window applies only to an unattempted row. Once claimed, a transient failure remains
  retryable on its durable backoff schedule. A successful classification increments the case status
  generation in the same transaction; completion acknowledges only the evaluated generation.
- `internal-box-classification.test.ts` and `box-classify-sweep.test.ts` cover permission failure,
  opt-out, stale claim tokens, terminal/deferred work, an eligible 26th row behind 25 failures and
  recompute retry. Maintenance monitor/API tests pin one fixed Durable singleton and repeat-start
  safety for the five-minute drain.
- Deployment proof still required: apply the retry schema, deploy API/orchestration, start the monitor,
  upload a fresh eligible photo and force one transient classify/status failure. Verify later retry
  stamps the same row and drains its status generation without starving a newer row.
# Follow-up verification requirement — 2026-07-13

PENDING — the supplied file-request upload proves case matching but reports no image analysis. Before `done`,
repeat that exact entry path and capture a terminal result for every image, the role/registration/reflection
stamps, readiness/chaser recomputation, retry behavior and zero silently unknown residue.
