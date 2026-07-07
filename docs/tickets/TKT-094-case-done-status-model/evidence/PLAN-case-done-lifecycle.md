# Plan: Add the `done` terminal lifecycle state (post‑EVA delivery tracking)

## Context

**The problem the user spotted.** The case lifecycle the UI exposes is *not ready → review → held*, but there is no home for a case once work on it is finished. Two concrete failures underlie this:

1. **Nothing live ever advances a case past `ready_for_eva`.** The live "Export for EVA" action (`EvaSubmitDialog.tsx`, `CaseDetail.tsx`) is a **pure client‑side JSON download — no network call, no status write**. The `caseBoxFinalize` API route is a hard‑coded `gated_off` stub; the fully‑built `requestFinalize` seam is never invoked; the gated finalize orchestration writes only *audit* rows, not `status_code`; and nothing writes `submitted_at`. A submitted case sits in `ready_for_eva` **forever**, so the dashboard throughput tiles are effectively always empty.
2. **Completed cases have no view and no search.** Terminal statuses map to **no queue by design** (governed by **ADR‑0008 "tool boundary ends at EVA handoff"**). They surface only as dashboard *counts with no drill‑through*. The top‑bar search box is decorative (it just navigates home); global search (TKT‑072) is backlog and doesn't say whether completed cases are even in scope.

**What "done" means (clarified by the user).** `done` is a **genuinely new terminal state that comes *after* `eva_submitted`** — "the CE report has been delivered back to the work provider," giving lifecycle tracking *beyond* the EVA handoff. It is triggered by any of:
- **(a)** a **sent email from a CE mailbox (info@ / desk@ / engineers@) to the case's work provider** — the primary signal;
- **(b)** a **CE report PDF uploaded into the case's Box folder** — the alternative signal;
- **(c)** *(later / gated)* **EVA Sentry API report‑retrieval polling** flipping `eva_submitted → done` when EVA reports the case's report is available.

**Two corrections the user made that this plan bakes in.**
- **`eva_submitted` fires automatically on the "Export for EVA" click** (not via a separate confirm).
- **`box_synced` as a lifecycle *end*-state is stale/misleading** — Box folders are now created at **intake**, not at the end. Keep the enum value for historical rows/audit, but stop portraying it as the terminal.
- **Placement = a separate "Completed/Archive" area + global search**, *not* a 4th work‑queue. The three work‑queues stay work‑only; this **amends** ADR‑0008 rather than overturning it.

**Intended outcome.** A case flows `ready_for_eva → eva_submitted` (on export) `→ done` (on delivery), completed cases are browsable and searchable, dashboard tiles drill through, and the misleading `box_synced`‑as‑terminal narrative is corrected across code and docs.

---

## Target lifecycle model

```
Before:  new_email → ingested → needs_review/(missing_*) → ready_for_eva ─┐  (dead end live —
                                                                          └── nothing advances it)
         [box_synced portrayed as the terminal END — STALE]

After:   new_email → ingested → needs_review/(missing_*) → ready_for_eva → eva_submitted → done
                                                                 ▲               ▲            ▲
                                                   (unchanged)   │   auto on     │  report delivered:
                                                                 │   Export-for- │  (a) sent email → provider
                                                                 │   EVA click    │  (b) report PDF in Box folder
                                                                                  │  (c) EVA poll [gated/later]

         box_synced: RETAINED enum value for history/audit; NO LONGER the linear tail
                     (Box folder is minted at INTAKE). Reframed in code + docs.
```

- Status count goes **12 → 13**; `done` = code **`100000012`**, label **"Done"**, guard‑**terminal**.
- New audit action **`report_delivered`** = **`100000049`** (next free code — the SQL/API action map runs to `100000048`).

---

## Locked decisions & open sub‑decisions

**Locked** (from the user): new `done` after `eva_submitted`; auto‑`eva_submitted` on export; `box_synced` reframed (not terminal‑end); Completed/Archive area + search, not a 4th queue.

**Open sub‑decisions (sensible defaults chosen; confirm during implementation):**
- **Report‑PDF discriminator (detector b).** No CE‑report naming convention exists in code today. Default: classify as a report when `contentType = application/pdf` **and** the filename contains the Case/PO or a "report"/"assessment" token; persist as `engineer_report` evidence (kind `100000007` already exists) rather than the generic `image`. Alternative: a Box metadata flag or a dedicated report subfolder.
- **Label wording.** Status name `done` / label **"Done"** per the user's explicit wording. ("Delivered" is a more precise alternative if the operator prefers — noted, not chosen.)
- **Name collision to document (not a blocker):** the ticket board already uses `done` as a *ticket* status; the new *case* status `done` is a different domain. Call this out in `CONTEXT.md` / `CLAUDE.md`.

---

## Phase A — Status model (the parity ring: 12 → 13)

Adding a status means editing the **parity ring in lockstep** — the Vitest parity test and the compiler are the safety net that fails the build on any omission. Edit order chosen so type errors catch misses:

1. **Domain contract** — `packages/domain/src/contracts/case-status.ts`: add `'done'` to the `CaseStatus` union (L30‑42), to `CASE_STATUSES` (L45‑58), and to `TERMINAL_STATUSES` (L70‑75, → 5 terminals). Fix the stale "11‑value" header comment (L5) → 13; extend the guard doc comment (L194‑198) to name `done` as an explicit‑write terminal. **The guard `statusForReviewCase` (L199‑222) needs no logic change** — terminal‑lock already returns `done` unchanged.
2. **Domain choiceset** — `packages/domain/src/data/choicesets/case-status.json`: add `{ "value": 100000012, "name": "done", "label": "Done" }` (L10‑21); set `stateMachine.linear` to `[…, "eva_submitted", "done"]` **dropping `box_synced`** (L24); add `"done"` to `stateMachine.terminals` (L26).
3. **DB choiceset** — `migration/assets/schema/000_enums_lookups.sql`: add `(100000012,'done','Done')` to `choice_case_status` (L177‑192); add `(100000049,'report_delivered','Report Delivered')` to `choice_audit_action` (after L139); fix the terminals comment (L170).
4. **New live delta** — `migration/assets/schema/deltas/2026-07-06-case-done.sql` (follow the `2026-07-04-retro-case.sql` pattern): `INSERT … ON CONFLICT (code) DO NOTHING` for both the status and audit rows. **No `ALTER`** — `done` reuses the existing `status_code` FK; `submitted_at`/retention columns already exist.
5. **API audit map** — `api/src/lib/audit.ts`: add `report_delivered: 100000049` (L23‑94).
6. **Compiler‑forced call sites** (adding to the union breaks these — good forcing functions):
   - `packages/domain/src/model/queues.ts` — `caseTypeOf` exhaustive switch (L190‑211): `case 'done': return 'both';`; `statusToStage` (L122‑141): `case 'done': return 'submitted';` so the funnel/throughput count it.
   - `mockup-app/src/components/StatusBadge.tsx` — `Record<CaseStatus, StatusStyle>` (L47): add a `done` badge (green / "Done").
   - `api/src/lib/mappers.ts` — `TWIN_TERMINAL` (L809‑813): add `'done'` (a delivered case isn't an open twin).
7. **Parity gates:** `packages/domain/src/contracts/case-status.parity.test.ts` and `case-status.test.ts` length asserts → **13**. Repair `migration/assets/verify-parity-pg.mjs` §4, which is **already stale/failing** (asserts 11 options / 3 terminals; reality is 12/4): update counts to 13 / 5 and fix the L13 comment. **Also sync the drifted domain `audit-event.json`** (stops at `100000034`; SQL/API run to `100000048`) — append the missing `100000035–100000049` so `verify-parity-pg.mjs` §1 passes, or explicitly scope that pre‑existing drift to a follow‑up note.

**Shippable alone?** Yes — behaviour‑neutral (no writer emits `done` yet), fully test‑gated, and the prerequisite for B–D.

---

## Phase B — `eva_submitted` fires automatically on "Export for EVA"

**API — a new dedicated endpoint** (do *not* repurpose the reserved `caseBoxFinalize` direct‑submit stub). In `api/src/functions/cases.ts`, add `POST /api/cases/{id}/eva-submitted`, modelled on the guarded idempotent write in `internalCasesSetIngested` (`internal.ts:2226‑2251`):

```sql
UPDATE case_ SET status_code = <eva_submitted>, submitted_at = now(), updated_at = now()
 WHERE id = $id AND status_code = <ready_for_eva> RETURNING id
```

On a returned row, `writeAudit({ action: eva_submitted, caseId, summary:'Exported for EVA', actor: actorFromClaims(claims) })`. The `WHERE status_code = ready_for_eva` guard makes it **idempotent** (double‑click → no‑op, no duplicate audit). Authz `withRole('CollisionSpike.User')`.

**SPA seam** — add `markEvaSubmitted(id)` to `mockup-app/src/data/rest-client.ts` (alongside `casesForQueue`/`openVrmTwins`, L273‑277), wrapped in a `useMutationFn` hook (`data/hooks.ts` pattern) so failures keep the dialog open.

**Call sites** — fire the write from **both** export handlers after a successful download, then re‑read so the badge flips and the case leaves the Review queue (the SPA has no react‑query; the "flip" is the next queue/case fetch):
- `mockup-app/src/screens/EvaSubmitDialog.tsx` — `onDownloadJson` (L350‑377) and the currently‑mock `onSubmit` (L379‑391).
- `mockup-app/src/screens/CaseDetail.tsx` — `onDownloadEvaJson` (L1303‑1324); update local `setC` after.

**Effect** — this finally writes `submitted_at`, so `submittedToday`/`clearedThisWeek`/`submittedTotal` (`api/src/functions/dashboard.ts:81‑100`) become real. Optional follow‑up: an admin‑only `eva_submitted → ready_for_eva` reversal for mis‑clicks.

**Shippable alone?** Yes, after A. High value / low risk — makes the throughput tiles real.

---

## Phase C — the `done` detectors

**Build the shared transition endpoint first:** `POST /api/internal/cases/{id}/mark-done` in `api/src/functions/internal.ts` (`withServiceAuth` / managed identity), same guarded‑idempotent shape:

```sql
UPDATE case_ SET status_code = <done>, updated_at = now()
 WHERE id = $id AND status_code = <eva_submitted> RETURNING id
```

then `writeAudit({ action: report_delivered, caseId, after:{status:'done'}, … })`. Body carries `{ signal: 'sent_email'|'box_pdf'|'eva_poll'|'manual', detail }` for the audit snapshot. The `WHERE status_code = eva_submitted` guard makes it safe under Durable at‑least‑once, Box webhook re‑delivery, and double‑fires. Add `markDone(caseId, signal, detail)` to `orchestration/src/lib/data-api.ts` and `mark_case_done(…)` to the Python `functions/box-webhook/data_api_client.py`.

> **Thin‑slice bridge (recommended given the Free‑Trial deadline):** ship a **manual "Mark report delivered"** action first — a `CaseDetail` button visible only when `status === 'eva_submitted'` → a staff‑role `POST /api/cases/{id}/mark-done` reusing the same guarded UPDATE. Zero detector infra; makes `done` usable and testable on day one and feeds the Phase‑D view. Then layer the auto‑detectors:

**Detector (b) — Box report‑PDF → done — build first (lowest new infra; the webhook is already live & E2E‑proven).** Host: the existing receiver `functions/box-webhook/function_app.py` `_process_upload` (~L508‑576). After case resolution (case is already resolved by `box_folder_id` → `GET /api/internal/box/case-by-folder/{folderId}`), classify the upload as a CE report (see open sub‑decision); if it is a report **and** the case is `eva_submitted`, call `mark_case_done(case_id, 'box_pdf', …)` and persist it as `engineer_report` evidence rather than the generic `image`. Case‑match is already solved; gate `BOX_API_ENABLED` (live true).

**Detector (a) — sent‑email‑to‑provider → done — build second (primary real‑world signal; moderate infra).** Host: the orchestration Graph pipeline. Add a **new Graph subscription on `SentItems`** per intake mailbox (current live subs are Inbox‑only) in `orchestration/src/functions/*subscriptions*` + the `graph-webhook` handler. On a sent message: (i) confirm a recipient matches the case's provider via `work_provider.known_email_domains`/`known_email_addresses` (reuse the existing `matchProviderByDomain`); (ii) resolve the case via `conversationId → inbound_email.conversation_id → case_id` (reuse the `triageContext`/`conversationSiblingCaseIds` machinery in `data-api.ts`, fallback Case/PO or VRM in subject). If the case is `eva_submitted`, call `markDone(caseId, 'sent_email', …)`. **No new provider‑email column needed** (columns confirmed present). Ship behind a new `DONE_SENT_EMAIL_ENABLED` flag (default off) — dark launch.

**Detector (c) — EVA report‑retrieval poll → done — build last (most infra; gated dark).** Host: a Durable eternal‑orchestration timer (pattern = the live `subscriptionMonitorOrchestrator`). Add a `GET /Report/GetAvailableReports` route to `functions/evasentry/eva_client.py`, match released reports to `eva_submitted` cases by claim ref / Case‑PO, then `markDone(caseId, 'eva_poll', …)`. Gated on `EVA_API_ENABLED` (absent → off) + EVA creds in Key Vault + the single‑principal‑code limitation + the 5‑min token refresh. Correctly deferred until EVA REST goes live.

---

## Phase D — Completed/Archive view + search fold‑in

**API — a new list endpoint** (the queue path can't be reused — `filterQueue`/`statusToQueue` exclude terminals by design). In `api/src/functions/cases.ts`, add `GET /api/completed/cases` (route ordered to avoid colliding with `cases/{id}`):

```sql
… WHERE c.status_code IN (<eva_submitted>, <done>, <box_synced>)
   ORDER BY c.submitted_at DESC NULLS LAST
```

with optional `?status=` (a "Delivered only" filter) + `?limit/offset`. Add `completedCases()` to `rest-client.ts`.

**SPA — new route + nav outside the Queues group.**
- `mockup-app/src/routes.tsx` (L26‑49): add `{ path: 'completed', element: <CompletedList /> }`. `CompletedList` can reuse the `CaseList.tsx` shell/table with the completed data source, showing a **"Delivered" (`done`) vs "Awaiting delivery" (`eva_submitted`)** split.
- `mockup-app/src/components/AppShell.tsx` (L406‑423): add a **new "Completed" nav section** *outside* the Queues group (L417‑418) — work‑queues stay work‑only. Revisit the "'Done (today)' is not a queue PAGE" comment in `queues.ts` (L21‑23): it now has a home that is explicitly not a work‑queue.

**Dashboard drill‑through.** `mockup-app/src/screens/Dashboard.tsx`: add `submitted: '/completed'` to `STAGE_ROUTE` (L119‑123); make the throughput tiles ("Sent to EVA / All time" L930‑939, and the `ThruCell`s L927‑929) clickable → `/completed` (copy the `onOpen` pattern the `InboxTile` already uses).

**Search fold‑in (TKT‑072).** The ticket proposes `GET /api/search?q=` (new `api/src/functions/search.ts`) across `case_`/`inbound_email`/`work_provider`, wiring the decorative `AppShell` SearchBox (L438‑444) to a `/search?q=` results view. **Explicit scope decision to bake in:** the `case_` search must **not** exclude terminals — include `eva_submitted` + `done` + `box_synced`; **exclude `removed`** by default (PII anonymised on soft‑remove), with a status badge on result rows. This makes global search the primary way (besides the Completed view) to reach a delivered case.

**Shippable?** The Completed view depends on A+B (needs cases reaching `eva_submitted`/`done`); search is a parallel TKT‑072 track needing only the "don't exclude terminals" decision.

---

## Phase E — `box_synced` cleanup + docs / ADR / tickets

**Reframe every `box_synced`‑as‑end‑state reference** (keep the enum value; stop calling it the lifecycle terminal, since Box sync is at intake):
- Code: `case-status.json` (L24, L26), `queues.ts` (L21‑23, L120, L135), `case-status.ts` (L62‑75 comments), `000_enums_lookups.sql` (L170), `mappers.ts` (L806‑813), `orchestration/.../finalize-eva-box.ts` (the `box_synced` audit on folder‑augment — reframe/retire), `codecs/index.ts` (`box_synced → box_sync` activity kind — keep for history).
- Docs: `docs/architecture/data-model.md` (state‑machine + terminals: add `done`, reframe `box_synced`), `docs/architecture/integrations.md` (clarify folders minted at intake; add Box‑FILE.UPLOADED→`done` and sent‑email→`done`), `CLAUDE.md` (L226 status shorthand → append `→ done`), `CONTEXT.md` (L74 "Avoid: Done" note), `ROADMAP.md` / `CURRENT_STATUS.md`.

**New ADR — `docs/adr/0023-post-eva-delivery-tracking-done.md`** (0022 is latest): the tool boundary still ends at the EVA handoff, but now **tracks delivery** via one post‑`eva_submitted` terminal `done`, triggered by sent‑email / Box report‑PDF / (gated) EVA poll, surfaced via a Completed area + search — **not** a 4th work‑queue. Explicitly amends **ADR‑0008 §"terminal statuses"**.

**CONTEXT.md glossary** — add a **"Done / Delivered"** entry ("terminal: the CE report has been delivered back to the work provider; follows EVA Submitted"); rescope the "Avoid: Done" note to EVA‑readiness only; reframe "Archive Synced"/`box_synced`.

**eva‑sentry‑api.md** — document report‑retrieval polling (`GET /Report/GetAvailableReports` + `GET /Report/GetReport?id=`), the 5‑min token, and the single‑principal caveat as the reason (c) is gated.

**Live registry** — record the new `done` status, `report_delivered` audit code, detector gate states, and (in `LIVE_FACTS.json` + the `docs/architecture/live-environment.md` mirror) that FILE.UPLOADED is live and Sent Items is the subscription to add. Then run `VERIFY_LIVE=1 node verify-all.mjs`. Live numbers stay only in `LIVE_FACTS.json` per the doc‑maintenance protocol.

**New tickets** (board max is TKT‑093 → start **TKT‑094**), relating to **TKT‑072** and the `proposed-usability-additions.md §6` proposal:
- **TKT‑094** — `done` status model + auto‑`eva_submitted` on export (Phase A+B), P1.
- **TKT‑095** — `done` detectors (manual → Box report‑PDF → sent‑email → EVA poll) (Phase C), P1/P2.
- **TKT‑096** — Completed/Archive view + dashboard drill‑through + fold terminal cases into global search (Phase D), P1.
- Update `docs/tickets/BOARD.md` (three rows + relationships; add a terminal‑scope acceptance criterion to TKT‑072).

---

## Recommended build order & shippable slices

Given the Free‑Trial go‑live pressure, ship the loop visibly first, then deepen the auto‑detectors:

1. **A** (status model — behaviour‑neutral, test‑gated) →
2. **B** (`eva_submitted` on export — real throughput, standalone) →
3. **C‑manual** ("Mark report delivered" button — makes `done` real with zero detector infra) →
4. **D‑completed** (Completed view + dashboard drill‑through) ∥ **D‑search / TKT‑072** (parallel) →
5. **C‑(b)** Box report‑PDF detector → **C‑(a)** sent‑email detector → **C‑(c)** EVA poll (gated).
6. **E** (docs / ADR / `box_synced` cleanup / tickets) rides alongside A–D.

> Note on priority: the user's *conceptual* primary signal is (a) sent‑email; the recommended *engineering* order builds (b) first because the Box webhook is already live while (a) needs a new Sent Items subscription. If you'd rather build (a) first, say so at approval.

---

## Verification (end‑to‑end)

- **Phase A gate:** `npm --prefix packages/domain test` (or the repo's vitest) — parity test passes at 13 statuses; `node verify-all.mjs` (offline contract/doc gate) is green; `node migration/assets/verify-parity-pg.mjs` §1/§4 pass (previously stale).
- **Phase B (drive the real flow):** run the SPA (`npm --prefix mockup-app run dev`) on a seeded `ready_for_eva` case → click **Export for EVA** → confirm the JSON downloads **and** the case badge flips to **EVA Submitted**, it leaves the **Review** queue, and the **Submitted today** / **Sent to EVA** dashboard tiles increment. Confirm the `audit_event` row (`GET /api/cases/{id}/activity`) and that a second click is a no‑op (idempotent).
- **Phase C‑manual:** on the now‑`eva_submitted` case, click **Mark report delivered** → badge → **Done**, `report_delivered` audit row present, case appears under **Completed**.
- **Phase C‑(b):** upload a report‑named PDF to the case's Box folder → the live `box-webhook` resolves the folder → case flips `eva_submitted → done` (verify via activity feed + Completed view). Re‑deliver the same webhook → no duplicate transition.
- **Phase C‑(a):** with `DONE_SENT_EMAIL_ENABLED` on in a test slot, send from a CE mailbox to a provider address on a threaded `eva_submitted` case → case flips to `done`; a send to a non‑provider recipient does **not**.
- **Phase D:** the **Completed** view lists `eva_submitted`/`done`/`box_synced` with the Delivered/Awaiting split; dashboard tiles drill through to it; global search returns a delivered case (and hides `removed`).
- **Regression:** the three work‑queues (`not-ready`/`review`/`held`) and their counts are unchanged; `box_synced` historical rows still render.

---

## Risks & constraints

- **Parity ring is the hard gate.** The Vitest parity test is the *live* gate and must move to 13 in lockstep; the exhaustive `caseTypeOf` switch + `StatusBadge` `Record` are compiler‑enforced and will fail the build until updated (the safety net). Repair the already‑stale `verify-parity-pg.mjs` (11/3 → 13/5) and the drifted `audit-event.json` while here.
- **Migration double‑write.** Edit `000_enums_lookups.sql` in place **and** ship the idempotent `deltas/…-case-done.sql` for the already‑live DB (matches how `removed`/retro codes were applied). No `ALTER` needed → low risk.
- **RLS / append‑only audit are non‑blockers** — the `eva-submitted`/`mark-done` writes are ordinary `case_` UPDATEs (allowed for staff/admin + MI) plus append‑only audit INSERTs; no new policy needed.
- **Idempotency under retries** — every transition is guarded on the expected current status, so Box re‑delivery, Durable at‑least‑once, and double‑clicks are all no‑ops.
- **Free‑Trial deadline** — the A→B→C‑manual→D‑completed slice closes the loop with zero detector infra; auto‑detectors and the gated EVA poll follow without blocking go‑live.
