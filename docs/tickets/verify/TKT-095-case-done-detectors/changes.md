# Changes — TKT-095: Case `done` detectors

## Status
detectors built (b live-code / a dark / c dark skeleton) — offline-tested; awaiting deploy + live proof (dispatcher-owned)

## 2026-07-09 — Phase C detectors (b, a, c) built on top of the shared mark-done endpoint

> Prereqs already in place from the dispatching session (NOT built here): the `done` status
> (code 100000012, terminal), audit `report_delivered` = 100000053, the guarded
> `POST /api/internal/cases/{id}/mark-done` (`internalCasesMarkDone`, `withServiceAuth`,
> `WHERE status_code = eva_submitted`), and the staff route + CaseDetail manual bridge.
> Nothing was deployed by this work; no Graph subscription was created; no ticket moved.

### Detector (b) — Box report-PDF → done (LIVE-SAFE code riding the already-live FILE.UPLOADED webhook)

Files:
- `functions/box-webhook/report_classifier.py` (NEW) — PURE classifier. **Discriminator
  (the plan's open sub-decision, resolved to its default):** an upload is a CE report when
  it is a **PDF** (filename extension; the Box webhook payload has no contentType) AND the
  filename contains the case's **Case/PO** (case-insensitive, space/punct-tolerant — both
  sides stripped to alphanumerics) OR a whole **`report`/`assessment` token** (tokenised on
  non-alphanumerics, so `reportage.pdf` does not hit). Alternatives (Box metadata flag /
  report subfolder) documented in the module docstring, deferred.
- `functions/box-webhook/data_api_client.py` — added `mark_case_done(case_id, signal,
  detail)` (POST `/api/internal/cases/{id}/mark-done`, same MI/httpx `_send` pattern;
  **best-effort by design**: never raises — a done-flip miss must never 503 a settled
  webhook); `resolve_case_context_by_folder()` (same single GET, now also returns the
  Case/PO; schema-tolerant when an older API returns `caseId` only — `resolve_case_by_folder`
  kept as a compat wrapper); `create_evidence(..., evidence_class=...)` (default `image`,
  unchanged wire shape; detector passes `engineer_report`, honoured verbatim by the API's
  evidence route → `choice_evidence_kind` 100000007).
- `functions/box-webhook/function_app.py` `_process_upload` — after case resolution,
  classify; a CE report persists as `engineer_report` evidence instead of the generic
  image class, then — LAST, after the unchanged evidence/audit/status-evaluate sequence —
  `mark_case_done(case_id, 'box_pdf', filename)` (best-effort + call-site try/except; the
  `{updated}` outcome is logged at info and echoed in the response body as
  `report`/`markedDone`). Runs on the evidence-dedup path too (a prior delivery may have
  written evidence and died before mark-done). **Failure semantics up to the mark-done call
  are byte-identical to pre-TKT-095** — no new state, no new 5xx path; webhook re-delivery
  is a server-side no-op via the mark-done WHERE guard.
- `api/src/functions/internal.ts` `internalBoxCaseByFolder` — additive: response now
  `{ caseId, casePo }` (pre-existing callers read `caseId` only).

### Detector (a) — sent-email-to-provider → done (built DARK behind `DONE_SENT_EMAIL_ENABLED`, default off)

Gate: `packages/domain/src/gates.ts` → `gates.doneSentEmail()` reads
**`DONE_SENT_EMAIL_ENABLED === 'true'`** (additive; default off/dark; comment documents the
flip semantics). **Subscription lifecycle on a gate flip (self-reconciling both ways):**
- **ON:** `runSubscriptionMaintenance` bootstraps one
  `users/{mailbox}/mailFolders('SentItems')/messages` (changeType `created`) subscription
  per configured intake mailbox, alongside the Inbox ones; renewal + 404-recreate keep the
  folder; a de-scoped mailbox prunes BOTH its Inbox and SentItems subs.
- **OFF (the live state):** the same maintenance pass PRUNES any of our SentItems
  subscriptions; with no SentItems subs present the routine is **byte-for-byte identical to
  today** (asserted by the new "gate OFF + no SentItems subs" test). **No subscription is
  created at deploy or by this session** — creation happens only inside a maintenance tick
  with the gate on.

Files:
- `orchestration/src/lib/subscriptions.ts` — folder-aware: `SubscriptionFolder`,
  `folderOfResource`/`isSentItemsResource`, `createSubscription(mailbox, folder='Inbox')`
  (SentItems subs route to the SEPARATE `/api/graph-webhook-sent` +
  `/api/graph-lifecycle-sent` endpoints — a notification's canonicalised resource carries
  no folder, so distinct notificationUrls are the only structural routing), maintenance
  bootstrap/prune/recreate as above.
- `orchestration/src/functions/graph-webhook-sent.ts` (NEW) — `graph-webhook-sent`
  (validation echo; defensive cold-start body read → 503 redeliver; clientState verify;
  gate-off = traced drop + 202; enqueue to `sent-messages`) + `graph-lifecycle-sent`
  (reauthorizationRequired → renew; removed/missed → log only, recreation owned by the
  folder-aware maintenance tick — keeps the live Inbox `graph-lifecycle.ts` untouched).
- `orchestration/src/functions/sent-items-processor.ts` (NEW) — queue trigger on
  `sent-messages`: gate re-check → mailbox resolve (resource UPN else subscription lookup,
  the fetchMessage doctrine) → Graph `$select` fetch of the sent message → recipient(to+cc)
  → provider match via the SAME `matchProviderByDomain` corpus rule → case resolve
  (conversationId → `triageContext.conversationSiblingCaseIds`; fallback Case/PO or VRM
  parsed from the subject) → hydrate through the NEW status-agnostic lookup →
  `decideSentItemsDone` → `markDone(caseId, 'sent_email', to+subject snippet)`.
  **Suggestion-grade conservative:** no provider-matched recipient, no eligible case, or
  ambiguity (>1) → traced no-op, never a guess.
- `orchestration/src/lib/sent-items.ts` (NEW) — the PURE helpers (recipient extraction,
  provider-recipient matching, subject Case/PO+VRM keys, the decision core, the audit
  detail builder). Unit-tested.
- `orchestration/src/lib/data-api.ts` — `markDone(caseId, signal, detail?)` and
  `casesLookup({ caseIds?, casePo?, vrm? })` (same MI request core as every other call).
- `api/src/functions/internal.ts` — NEW `POST /api/internal/cases/lookup`
  (`internalCasesLookup`, `withServiceAuth`, READ-ONLY, **status-agnostic** — needed
  because `triage/context`'s openCaseMatches excludes terminals and the detector's targets
  sit in the terminal `eva_submitted`; returns `caseId/casePo/status/workProviderId/vrm`,
  id-list capped 20, result capped 25).
- `orchestration/src/index.ts` — registers the two new modules (+ detector (c) below).

### Detector (c) — EVA poll (MINIMAL dark skeleton, gated on `EVA_API_ENABLED`)

- `orchestration/src/functions/gated/eva-report-poll.ts` (NEW) — a KEYED HTTP starter
  (`POST /api/eva-report-poll`, authLevel `function`, the retro-case pattern) that refuses
  while `EVA_API_ENABLED` is off; a singleton Durable eternal-orchestration STUB
  (`evaReportPollOrchestrator`, subscriptionMonitor cadence shape: tick → durable timer →
  continueAsNew) whose tick activity gate-checks and currently ALWAYS no-ops with a clear
  trace (`gate_off` / `poll_not_built`) — so the orchestration stops rather than looping
  dark. The module doc records the eva-sentry-api design it will implement on activation:
  `GET /Report/GetAvailableReports`, the ~5-minute token (mint per pass, never cache),
  match released reports to `eva_submitted` cases by claim ref / Case-PO, then
  `markDone(caseId, 'eva_poll', …)`. **The poll body + the
  `functions/evasentry/eva_client.py` GetAvailableReports route are deliberately NOT
  built** — they land when EVA REST activates (Minotaur single-principal limitation;
  docs/gated.md). Nothing can fire: gate off + keyed starter + no auto-start at deploy.

### Gate semantics summary

| Gate | Governs | Live value | Flip effect |
|---|---|---|---|
| `DONE_SENT_EMAIL_ENABLED` | detector (a): SentItems subscription create/prune (maintenance), the sent webhook enqueue, the queue processor | absent (off, dark) | ON → next maintenance tick creates SentItems subs; OFF → next tick prunes them; handlers drop with a trace meanwhile |
| `EVA_API_ENABLED` | detector (c): the keyed starter + the poll tick | false (off — Minotaur) | ON alone still no-ops loudly (`poll_not_built`) — the poll body lands with EVA REST activation |
| `BOX_API_ENABLED` | the webhook host (pre-existing) | true | detector (b) rides the live webhook; no new gate |

### Tests + offline gates (run 2026-07-09, Windows)

- `functions/box-webhook` `python -m pytest -q` — **150 passed** (new:
  `tests/test_report_classifier.py` [is_pdf / Case-PO tolerance / token precision /
  composed discriminator]; `tests/test_data_api_client.py` +
  `test_mark_case_done_posts_signal_and_detail`, `_guard_noop_returns_false`,
  `_best_effort_on_http_error`, `_best_effort_on_transport_error`, `_noop_when_url_unset`,
  `test_resolve_case_context_*` (3), `test_create_evidence_engineer_report_class_is_sent_verbatim`;
  `tests/test_webhook.py` + `test_receiver_report_pdf_persists_engineer_report_and_marks_done`,
  `_report_by_case_po_in_filename_without_token`, `_non_report_pdf_stays_generic_no_mark_done`,
  `_image_upload_behaviour_unchanged_by_detector`, `_mark_done_failure_still_settles_200`,
  `_report_redelivery_dedups_write_but_still_attempts_mark_done`).
- `npm --prefix orchestration test` — **228 passed / 14 files** (new
  `src/lib/sent-items.test.ts` — recipient extraction, provider matching incl.
  exact-address + inactive, subject keys, the conservative decision core incl.
  non-provider-recipient + ambiguity + already-done no-ops; extended
  `src/lib/subscriptions.test.ts` — folderOfResource/isSentItemsResource + the five
  gate-flip maintenance scenarios incl. the byte-identical gate-off assertion).
- `npm --prefix api test` — **335 passed**; `npm --prefix packages/domain test` —
  **1058 passed**.
- `tsc -b` (`npm run build`) green for `packages/domain`, `orchestration`, `api`.
- `node verify-all.mjs` — 11 PASS / 1 FAIL / 9 SKIP; the single FAIL is the
  **pre-existing environmental parser pytest failure on this Windows box** (recorded in
  session memory before this ticket; unrelated to TKT-095 — no parser files touched).
  The box-webhook gate SKIPs in verify-all (no registered .venv) but was run directly
  above (150 passed).

### Honest remainders (dispatcher-owned)

- Deploy: `cespk-api-dev` (lookup route + casePo), `cespk-orch-dev` (gated dark surface),
  and the box-webhook Function (`cespkbox-fn-v76a47`) — detector (b) rides the LIVE webhook
  once deployed.
- Live proof (b): a case in `eva_submitted` + a report-named PDF uploaded to its Box folder
  → `done` + `report_delivered` audit; re-delivery no-op.
- Live proof (a): needs `DONE_SENT_EMAIL_ENABLED=true` in a test slot → maintenance tick
  creates the SentItems subs (verify prune on flip-off) → threaded CE→provider send flips
  an `eva_submitted` case; non-provider recipient does not.
- (c) stays a documented skeleton until EVA REST activates.
- Registry/docs (LIVE_FACTS.json gate list + live-environment mirror, gated.md entry for
  `DONE_SENT_EMAIL_ENABLED`) after deploy — live-numbers protocol.
- verification.md: PENDING (no verdict written here).
