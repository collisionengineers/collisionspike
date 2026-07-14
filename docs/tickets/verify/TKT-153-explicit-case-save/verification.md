# Verification — TKT-153: Save case edits explicitly as one reviewed change

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started.

## How to re-verify
Run edit-session tests and use Chrome on a designated test case to prove unchanged-before-Save, atomic persistence after Save, cancel, conflict, retry, and audit behavior.

## Independent verification update — 2026-07-14

### Verdict

PENDING — the explicit-save SPA is deployed and the merged source/release bundle provides strong
offline evidence for the one-request transactional design, but there is no deployment record or live
fingerprint for the matching Data API bundle and no authorised designated-case proof of
unchanged-before-Save, atomic persistence, conflict/retry behaviour, or the resulting audit.
Acceptance line 39 therefore remains open.

### Evidence

- Acceptance 1 (`TKT-153...md:25`) — current source keeps a local working copy and server-confirmed
  baseline until Save (`CaseDetail.tsx:927-966`); dirty state is derived without a request
  (`:1096-1111`). The fresh production JS contains this edit session and calls `saveCaseEdits` only
  from the Save action.
- Acceptance 2 (`:26`) — `CaseDetail.tsx:1096-1110,2346-2397` exposes `Save changes` and `Discard
  changes`, announces clean/dirty/saving/error state, and disables Save unless there is a valid dirty
  versioned draft. Those exact controls are present in the production JS.
- Acceptance 3 (`:27`) — discard restores the persisted snapshot (`CaseDetail.tsx:1153-1163`) behind
  a confirmation dialog (`:2946-2969`); route and browser-leave guards are installed only while dirty
  (`:1111-1121`) and the leave/stay dialog is at `:2971-3004`. Both dialog texts occur in the deployed
  JS.
- Acceptance 4 (`:28`) — `case-edit-session.ts:199-250` validates all required EVA fields through the
  shared field order and normaliser plus the inspection contract, returns every issue, and
  `CaseDetail.tsx:1096-1104,2378-2381` counts and focuses them.
- Acceptance 5 (`:29`) — the API enters one database transaction before locking/loading the case
  (`api/src/functions/cases.ts:473-507`), makes the case/address/decision/readiness/provenance/audit
  changes inside it (`:526-603,648-770`), and returns server truth only after completion. The rollback
  test injects an inspection-write failure and proves rollback with no success audit
  (`case-edit-save.test.ts:319-326`).
- Acceptance 6 (`:30`) — the deployed client sends exactly one versioned `PATCH /api/cases/{id}`
  containing `{editSession:true}` and `If-Match`; production bundle context proves there is no second
  inspection POST. Server code rejects mismatched/missing paired address decisions and writes address
  plus decision in the same statement/transaction (`cases.ts:545-603`). Client tests pin one request
  and no early success while delayed (`rest-client.test.ts:266-314`).
- Acceptance 7 (`:31`) — the deployed request carries `If-Match`; the API requires a version and
  returns 409 before any write on stale state (`cases.ts:479-505`;
  `case-edit-save.test.ts:129-144`). The client retains intended fields while rebasing untouched fields
  onto a newly loaded version (`CaseDetail.tsx:1206-1248`).
- Acceptance 8 (`:32`) — a failed save changes only error/conflict/saving state, leaving the draft and
  baseline intact (`CaseDetail.tsx:1165-1203`); plain-language retry text and `Try again` are in
  production. The client test proves a 503 rejects without mutating the retry body
  (`rest-client.test.ts:316-322`).
- Acceptance 9 (`:33`) — success adopts the returned case/version and clears draft-only inspection
  state (`CaseDetail.tsx:1175-1188`). The server evaluates status once from the complete reviewed
  draft in the transaction (`cases.ts:648-690`), writes only current staff provenance and one strict
  redacted audit listing field names but not values (`:694-770`;
  `case-edit-save.test.ts:146-174`).
- Acceptance 10 (`:34`) — the mutation remains behind `withRole('CollisionSpike.User')` on the server
  (`cases.ts:408-413`); the UI is not the authorisation boundary.
- Acceptance 11 (`:35`) — photo decisions remain immediate but the Evidence tab explicitly says so,
  while case fields and inspection use Save (`CaseDetail.tsx:185-186,2443-2447`). Registration and
  Case/PO retain visibly separate Save/Cancel controls as documented in `changes.md:22-24`; no hidden
  second inspection operation remains.
- Acceptance 12 (`:36`) — source provides an `aria-live`/`role=status` save region
  (`CaseDetail.tsx:2346-2367`), labelled buttons/dialogs, and wrapping save-bar/action layout
  (`:281-305`). This is implementation evidence only; no live keyboard, screen-reader, narrow-width or
  true-200%-zoom case-edit pass is recorded.
- Acceptance 13 (`:37`) — named tests cover no-op/cancel/multi-field/validation/navigation and stable
  retry bodies (`case-edit-session.test.ts:62-269`), stale/no-version/atomic/audit/status/rollback
  behaviour (`case-edit-save.test.ts:129-326`), and the ticket records domain 1,136, API 632, SPA 465
  plus all production builds (`changes.md:40-44`).
- Acceptance 14 (`:38`) — address and Image Based Assessment are each pinned in the single request
  (`case-edit-session.test.ts:109-154`); delayed response cannot expose success
  (`rest-client.test.ts:288-314`), and decision-write failure rolls back and emits no audit
  (`case-edit-save.test.ts:319-326`). With one request there are no competing responses left to
  reorder. This is offline evidence, not a live failure-injection trace.
- Acceptance 15 (`:39`) — no satisfying live artifact exists. This ticket contains no designated-case
  run.
- Fresh deployment evidence: on 2026-07-14, production root and `/assets/index-CbUqeEAY.js` both
  returned 200 with `Last-Modified: Mon, 13 Jul 2026 12:48:32 GMT`; JS SHA-256 is
  `CEAE61DFE54EC9072E0AE6A154C0066A05FD495FEDA48D8B0560E54B1F8E4A0F`. It contains `Save changes`,
  `Discard changes`, dirty/saving/error/saved states, both confirmation dialogs, stale-edit
  reconciliation copy, and the exact single `PATCH` with `{editSession:true}` and `If-Match`. This
  proves the SPA half is live.
- Git proves implementation/release-artifact merges `ab2d677f` and `f3ec6a22` plus later
  reconciliation `b1bf2df6` are ancestors of current HEAD, and tracked `deploy/api/main.cjs` contains
  the explicit-save API. However, `.azure/deployment-plan.md:54-65` leaves the then-active API/SPA
  publish pending and `:69-116` records only the older dashboard-wave API/SPA release; there is no
  later API SHA/deployment proof for TKT-153. The registry confirms the live API resource/count but
  not its deployed commit (`live-environment.md:400-409,544-547`).

### Pending / gaps

- Prove the live Data API runs the matching explicit-save bundle. A merged/tracked
  `deploy/api/main.cjs` is not deployment evidence, and the SPA being live does not prove API
  compatibility.
- Perform the acceptance-39 designated-test-case run: baseline the API/database/audit, edit without
  Save, prove no PATCH/server change, then Save and prove exactly one complete persisted change,
  readiness recomputation, current provenance and one redacted attributable audit. No non-test case
  may be changed.
- Exercise both physical-address and Image Based Assessment saves, Discard/reload, navigation guard,
  stale-version reconciliation, network failure with draft retention, and idempotent retry against
  the deployed pair.
- Record live keyboard, screen-reader, narrow/mobile, short-height and true 200% zoom reachability for
  Save/Discard plus dirty/saving/error/saved announcements.
- The complete focused test suites could not be independently rerun from the clean verification
  worktree because it has no local `node_modules`; recorded implementer runs and source tests were
  inspected, but they are not a substitute for required live proof.

### How to re-verify

1. Identify or deploy the exact reviewed API bundle and record commit/artifact hash, function-app
   publish time, healthy function inventory, 401 auth boundary and quiet post-release telemetry; pair
   it with the already observed SPA asset hash.
2. Use only an operator-designated existing test case. Capture its case JSON/version, relevant
   database fields/provenance and audit count before touching the UI.
3. In signed-in Chrome, change multiple fields plus a physical address. Confirm Network shows no
   mutation before Save, direct API/DB reads remain unchanged, Discard restores values, reload
   restores values, and attempted navigation offers Stay/Leave.
4. Repeat with Image Based Assessment/reason. On Save require exactly one versioned PATCH; verify the
   returned and reloaded case, address, decision, status, provenance and exactly one redacted audit
   agree. Prove no success appears while the response is pending.
5. In a second session change the case first, then submit the stale draft: require 409 and zero writes.
   Use `Reload latest`, prove unrelated concurrent values survive, then retry once. Simulate a
   transport/5xx failure and prove the same draft remains and retry does not duplicate
   audit/provenance.
6. Repeat UI reachability/announcement checks with keyboard and screen reader at desktop, narrow
   mobile, short height and actual browser 200% zoom. Record screenshots, accessibility tree, request
   trace and audit/DB readback.

### Confidence + unread surfaces

HIGH for the conclusion that the SPA implementation is deployed and live acceptance is incomplete;
MEDIUM for the matching backend’s actual state because no release record fingerprints the deployed
API. Unread/unexercised surfaces are the deployed API artifact identity, authenticated case traffic,
current case/database/provenance/audit rows, and live assistive-technology/responsive behaviour. No
case, cloud setting, firewall rule or Archive item was changed.
