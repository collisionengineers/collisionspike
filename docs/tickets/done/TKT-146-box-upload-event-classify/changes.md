# Changes — TKT-146: Classify images at Box-upload event time (the FILE.UPLOADED lane has no classify path)

## Status
code-complete + DEPLOYED + LIVE-PROVEN (2026-07-10, feat/backlog-drain) — orch 73→74
(`box-classify-sweep` timer), api 95→96 (`internalEvidenceUnclassifiedBox` read route). Live proof
performed by the implementer on the test area: a facade upload into the A.PCH26036 case folder was
registered at 11:28:19Z and stamped `overview` + `registration_visible=true` at **11:30:09Z —
1 min 50 s after upload** (within one sweep period). Evidence under [evidence/](./evidence).

## What was built (the decided architecture, verbatim)

A **timer-triggered orch sweep** (period **every 5 minutes**, NCRONTAB `0 */5 * * * *`; per-sweep
cap **25** — both **code constants**, no new app-setting) that closes the FILE.UPLOADED classify
gap per the TKT-112 ownership model (orch owns autonomous stamps):

1. **Enumerate** still-unclassified box-lane image rows via a NEW additive internal read route
   `GET /api/internal/evidence/unclassified-box?limit=25` — server-side predicate is the **TKT-131
   "still-unclassified" test**: `image_role_code = unknown(100000003) AND registration_visible IS
   NULL`, restricted to `box_file_id IS NOT NULL AND source_label LIKE 'box_upload%'` (the
   box-webhook writes `box_upload` or `box_upload sha1=<sha1>`; retro-register archive rows use a
   different label and are deliberately out of scope), `kind_code = image`, `excluded = false`,
   `created_at > now() - interval '14 days'`, **newest first**. Joined to `case_` for each row's
   `vrm` + `work_provider_id`.
2. **Fetch bytes via the existing Box facade ONLY** — `box.downloadFile` on `BOXWEBHOOK_FN_URL`
   (+ KV-ref key), the read op the retro reconstruction already uses; server-side
   `BOX_DOWNLOAD_MAX_BYTES` (~25 MiB) cap → an over-cap 413 is absorbed per-row. No Box REST from
   new code.
3. **Classify via `orchestration/src/lib/image-classify.ts` (TKT-064) verbatim** — never-throws;
   case-VRM-constrained `registration_visible` (a legible but *mismatched* plate stays false);
   non-vehicle `other` → role coalesces to the `unknown` code (no `other` option in the image-role
   choice set) + `accepted_for_eva=false`; person reflection → `excluded` + reason + the TKT-123
   advisory flag. The **per-provider `ai_allowed` opt-out** is honoured exactly like
   classifyPersist/evidence-backfill (explicit `false` skips; lookup error fails open; cached per
   sweep per provider).
4. **Stamp via the EXISTING internal evidence route** — a re-POST of the row's **own identity**
   (`sourceMessageId` = its `box:file:<id>` tag only when the row carries one, else `boxFileId`
   alone); the route's box-lane NOT-EXISTS no-ops the insert and `applyEvidenceMetadata` updates in
   place. **Deliberately NO sha256 on the stamp**: supplying one would engage the TKT-133
   `(case_id, sha256)` twin pass, which can redirect the stamp onto a cross-lane twin row and loop
   the sweep on the still-unstamped target.
5. **Status re-evaluate once per stamped case** — the same idempotent re-invoke the FILE.UPLOADED
   registration itself performs (and evidence-backfill step 6), so a case whose photo set now
   satisfies the EVA image rules advances.

Failure semantics: per-row never-throws — facade error / classify null / stamp error logs and
continues; the row stays role-unknown and is retried on later sweeps until the 14-day window ages
it out. A sweep with nothing to do costs one internal GET (0-row fast path). The gate check runs
before anything else: `gates.imageRoleClassifyEnabled()` (the **TKT-064** gate —
`IMAGE_ROLE_CLASSIFY_ENABLED` + `AI_MODEL_ENDPOINT` + `AI_MODEL_DEPLOYMENT`) **and**
`gates.boxApi()`; either off → honest no-op (also the operational kill switch).

### Recorded decisions / deltas from the brief
- **"Event time" definition (recorded as instructed):** within **one sweep period (5 min)** of
  upload — with the FC1 caveat that a plain NCRONTAB timer does not WAKE a scaled-to-zero Flex app
  (LIVE_FACTS `subscriptionRenewalRisk` root-cause): the tick fires while the app is awake (Graph
  push intake traffic, queue work, the durable monitor's ~6h wake) and a missed tick runs as
  past-due catch-up on the next wake. Observed live latency: 1 m 50 s.
- **Gate correction to the brief:** the brief suggested reusing `IMAGE_ANALYSIS_ENABLED`; verified
  in code that image-classify (TKT-064) is actually gated by **`IMAGE_ROLE_CLASSIFY_ENABLED`**
  (`packages/domain/src/gates.ts:50,218`; `IMAGE_ANALYSIS_ENABLED` gates the separate TKT-016
  staged suggestion producer). The sweep uses `gates.imageRoleClassifyEnabled()` like every other
  TKT-064 caller. Verified live `true` on `cespk-orch-dev` (was live-but-untracked in the registry
  gates block — drift fixed in LIVE_FACTS this pass).
- **No new app-setting.** Cap (25) and period (5 min) are exported constants in
  `box-classify-sweep.ts`; kill switch = the existing gates.
- **box-webhook Python Function untouched**, as instructed.
- **Backlog drain rides along (by design):** enumeration found **242** accumulated unclassified
  box-lane rows (post-TKT-131 arrivals); the sweep drains them at ≤25/5 min (~$0.57 AOAI at
  TKT-131's ~$0.0024/image) — first live sweep: enumerated 25 / classified 25 / stamped 25 /
  failed 0 in 189 s; backlog observed 242 → 227 during the proof window.
- **Known bounded residual:** a row whose classify fails persistently (e.g. an AOAI content-safety
  refusal — TKT-131 left 4 such) is re-tried every sweep until its `created_at` leaves the 14-day
  window; the per-sweep cost is bounded by the cap and the gate is the kill switch.

## Files touched
- `api/src/functions/internal.ts` — NEW route `internalEvidenceUnclassifiedBox`
  (`GET /api/internal/evidence/unclassified-box`, withServiceAuth, limit clamped 1..100) + header
  route list entry.
- `orchestration/src/lib/data-api.ts` — NEW `unclassifiedBoxEvidence(limit)` +
  `stampBoxEvidenceClassification(caseId, row)` client methods + `UnclassifiedBoxEvidenceRow`.
- `orchestration/src/functions/box-classify-sweep.ts` — NEW: the timer sweep (schedule/cap
  constants, `mimeForClassify`, `buildStampRow`, the handler).
- `orchestration/src/functions/box-classify-sweep.test.ts` — NEW: offline pins (a) happy path +
  identity mirroring + **never-a-sha256**, (b) untagged-row identity, (c) never-throws row
  isolation, (d) gate/0-row fast paths, (e) ai_allowed opt-out + fail-open, (f) TKT-064 policy
  verbatim (other→not-accepted, reflection→excluded, case-VRM constraint), mime fallback.
- `orchestration/src/index.ts` — side-effect import of the new module.
- `deploy/orch/main.cjs`, `deploy/api/main.cjs` — rebuilt esbuild bundles (import.meta.url banner).
- `LIVE_FACTS.json` + `docs/architecture/live-environment.md` — counts 74/96, narrative, the
  IMAGE_ROLE_CLASSIFY_ENABLED gates-block drift fix.
- This folder: `changes.md`, `verification.md` (evidence pointers; verdict stays PENDING for the
  dispatching loop), `evidence/upload-receipt.json`, `evidence/stamped-row.txt`,
  `evidence/kql-sweep.txt`.

## Commits
- One implementation commit on `feat/backlog-drain` (this commit — hash in the dispatch return
  report): api read route + orch sweep + tests + bundles + registry + ticket artifacts.

## Deploys (docs/azure/deploy.md; func from Windows, az from WSL)
- Build: `npm run build` (orch + api, tsc clean), vitest **284/284 (orch)** + **395/395 (api)**,
  `node build-orch.cjs` / `node build-api.cjs`, `npm install --prefix deploy/* --omit=dev`, local
  bundle smoke (orch registers 74, api 96 — no import.meta.url crash).
- `func azure functionapp publish cespk-orch-dev --javascript` → **74 functions**
  (`box-classify-sweep` present), app **Running** (ARM `properties.state`).
- `func azure functionapp publish cespk-api-dev --javascript` → **96 functions**
  (`internalEvidenceUnclassifiedBox` present), app **Running** (ARM).
- Smokes: unauth GET on the new route → **401** fail-closed; App Insights (both components, 30-min
  window) → **0 exceptions / 0 5xx**; Graph subscriptions **still 3** (keyed `graph-renew` POST:
  3 renewed, `errors: []`, monitor Running).
- Deploy-order note: orch shipped first per the brief; sweeps in the ~5-min gap before the api
  route existed would only warn-and-return (enumeration failure path) — self-healing by design.
