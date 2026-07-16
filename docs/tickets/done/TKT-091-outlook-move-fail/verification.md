# Verification — TKT-091: Outlook File-to move failing live

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier final ruling — acceptance 4's live move landed at
~21:03Z and was independently corroborated in both App Insights components)

## Final ruling (transcribed verbatim, 2026-07-10, ~21:07Z)

- **Acceptance 1 — 503 root cause named with App Insights evidence: MET** (the sole pre-fix 503 was
  handler-returned on enqueue 404 QueueNotFound — the queue was never provisioned; queue EXISTS
  today + the api MI holds Storage Queue Data Message Sender).
- **Acceptance 2 — meaningful status codes + unit tests: MET** (`classifyEnqueueFailure` mapping;
  6/6 tests re-run by the verifier; deployed bundle carries it; letter nuance recorded — Graph
  denial reports back asynchronously as row-state `failed`, by design).
- **Acceptance 3 — SPA readable error: MET** (toast strings in the served bundle; the failure path
  has never fired post-fix — expected absence).
- **Acceptance 4 — post-B4-grant live move succeeds, email moves, audited: MET 2026-07-10 ~21:03Z**,
  operator-authorized click driven in the operator's signed-in SPA session, corroborated end-to-end
  by the verifier's OWN KQL: api 21:03:19.01Z `moveInboundToOutlook` → **202** (296ms, inbound
  `bd859d3b…`) → orch 21:03:26.28Z `outlook-move` consumer success → 21:03:29.55Z
  `{"evt":"outlook-move"…}` trace (emits only AFTER Graph move succeeded + report-back returned) →
  api 21:03:29.51Z `internalInboundOutlookMoved` → **204**. Click→moved chain **10.5s**, zero 503s.
  DB (W9): census 1 `moved` / 1 `failed` / 997 null; audits `100000039` requested 21:03:19.30Z +
  `100000040` completed 21:03:29.53Z.
- **Caveat judged:** the moved email (`bd859d3b…`) is not the 07-06 latched-failed `a137d98f…` —
  the original 503 was infrastructure (missing queue), not row-specific, so any real email proves
  the fix; the latched row is by-design residue, re-clickable by staff. Acceptance satisfied;
  retrying that row is optional hygiene.

Verified by: ticket-verifier dispatch (final ruling), 2026-07-10.

---

## Initial sweep verdict (2026-07-10, pre-click — superseded by the final ruling above)
**PENDING** — three of four acceptance arms met with live artifacts; the fourth (a real staff
"File to …" click post-fix) had never occurred and was deliberately operator-reserved.

## Sweep verdict (transcribed verbatim, 2026-07-10)

- **Acceptance 1 — 503 root cause named with App Insights evidence: ESTABLISHED.** KQL (api
  component `95e70d0f…`, operation `99f0ce3fbcd60feb989d353e5309db4d`): the one live 503
  (2026-07-06T12:39:41Z, `moveInboundToOutlook`) shows the handler **completed and returned** 503
  (Succeeded, 171ms) — not a cold start, not a crash, not the B4 Graph 403. Root cause
  (changes.md + `services/data-api/src/features/inbound/`): enqueue threw 404 **QueueNotFound** — the
  `outlook-move` queue was never provisioned. Corroborated live today: the queue now EXISTS
  (`az storage queue list` on `cespkorchstdev01` → 9 queues incl. `outlook-move`).
- **Acceptance 2 — meaningful status codes + unit tests: MET (offline + artifact).**
  `services/data-api/src/features/inbound/outlook-queue.ts` `classifyEnqueueFailure` maps
  `queue_missing / not_authorised / not_configured / no_identity / unavailable`; the route returns
  `503 {error, reason, message}` + audits the reason; gate-off → 409. `outlook-queue.test.ts` →
  **6/6 passed** (incl. the live QueueNotFound literal + the no-engineering-language assertion).
  Deployed artifact carries the mapping; live app lists 96 functions incl. `moveInboundToOutlook` /
  `getOutlookMoveGate` / `internalInboundOutlookMoved`. *Nuance:* the acceptance letter says
  "Graph-denied → 4xx" — in the shipped async design Graph runs in the orch consumer (reports
  `failed` via write-back), so the route's own failure modes are enqueue failures with distinct
  machine-readable reasons. Substance met; letter differs by architecture.
- **Acceptance 3 — SPA shows a readable error: MET in code + the DEPLOYED bundle.** Live SWA bundle
  `assets/index-D-JoRJ9H.js` contains `Couldn't file this email.`, `Please try again in a moment`,
  3× `serverMessage` (`Inbox.tsx:1016-1026` + `rest-client.ts`). No live failed-move remains to
  photograph (queue exists, grant landed) — expected absence.
- **Acceptance 4 — post-B4-grant live move succeeds: NOT MET — the decisive event has never
  happened.** KQL over 30d: exactly ONE `moveInboundToOutlook` request ever (the 07-06 503), **zero
  since the fix**; zero `internalInboundOutlookMoved` write-backs; orch `outlook-move` consumer
  executions **empty** in 30d; zero `[outlook-move]` traces. Four independent signals agree: no staff
  "File to …" click has occurred since the fix deployed. Preconditions all live-verified ready:
  queue exists; api MI `51dcdd5f…` holds **Storage Queue Data Message Sender** on
  `cespkorchstdev01`; `OUTLOOK_MOVE_ENABLED=true` both apps + queue URL set; Mail.ReadWrite
  Exchange-RBAC grant done 2026-07-03 (ticket board B4). The previously-failed row `a137d98f…` is
  latched `failed` and re-clickable.

### Pending / gaps
- **The only blocker:** one staff/operator "File to …" click (mailbox mutation — operator-reserved
  per changes.md/ticket board; a verifier cannot perform it). Expected on click: 202 → orch consumer
  execution → row `queued→moved` → email in the target folder + audit rows (100000039/100000040).
- Queued SQL for the next data pass:
  `SELECT id, outlook_move_state, outlook_moved_folder, outlook_moved_at FROM inbound_email WHERE id='a137d98f-bda5-4e09-bdac-c306a2fd3f7a';`
  `SELECT outlook_move_state, count(*) FROM inbound_email GROUP BY 1;` — expect the row `failed`,
  zero rows `moved`.

### How to re-verify (operator click, then)
1. api KQL: `requests | where url contains "outlook-move"` in the click window — expect
   `moveInboundToOutlook` **202** then `internalInboundOutlookMoved` **204**.
2. orch KQL: `requests | where name == "outlook-move"` → one success; the
   `'"evt":"outlook-move"'` moved-event trace.
3. Operator confirms the email sits in the target Outlook folder; run the queued SQL for the
   `moved` row + audit.
4. Offline gate: `npm --prefix services/data-api run test -- src/features/inbound/outlook-queue.test.ts` (6 tests).

Verified by: ticket-verifier dispatch, 2026-07-10.

### W6 data-pass results (orchestrator-run, 2026-07-10 — the queued SQL)
- The latched row `a137d98f…` reads `outlook_move_state='failed'`, target folder
  `Inbox/Instructions`, stamped 2026-07-06 12:39:41Z — exactly the one recorded 503.
- Move-state census: **1 failed / 998 null** — zero `moved` rows, corroborating the four KQL
  signals: no staff "File to …" click has ever occurred post-fix. The operator click remains the
  sole blocker.
