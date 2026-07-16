# Verification — TKT-166: Persist instruction and extra files from Manual Intake

## Verdict

TESTED (offline) — implementation and independent-review fixes pass the complete local suites.
Deployment and the ticket-required disposable live-case proof remain owned by the dispatching loop.

## Offline evidence

- Domain: **56 files / 1,138 tests passed**.
- Data API: **67 files / 681 tests passed**.
- Orchestration: **30 files / 417 tests passed**.
- SPA: **43 files / 483 tests passed**.
- Production TypeScript builds passed for Domain and the Data API; the SPA TypeScript/Vite build
  produced a production bundle.
- `node verify-all.mjs`: **8 passed / 0 failed / 13 expected skips**.
- `git diff --check` passed before both review-fix commits.

Regression coverage includes:

- retry identity surviving a same-tab reload and rotating only for an intentional new draft;
- one case/Case-PO plus exactly-once create side effects under exact replay and response-loss retry;
- instruction/extra/image roles bound into the manifest and persisted distinctly;
- a stable explicit instruction index, no recovery auto-promotion and conflicting-role refusal;
- equal filename/size selections retained for server-side hashing and client/server MIME parity;
- partial, total, stale-binding and already-complete outcomes;
- batch-result audit records for refusal and partial completion plus exactly one response-loss recovery;
- terminal archive dead-letter, Not Ready state and staff requeue recovery;
- one atomic terminal-dead-letter/status-recompute handoff, one canonical Review-to-Not-Ready
  recompute and no duplicate handoff on a stale defer replay;
- changed-selection replay retaining an earlier-key/content-dedup evidence dead-letter, with the retry
  route covering every Manual Intake item binding on the case;
- source-readiness-only merge helpers that preserve unrelated dirty case-edit values for the audited
  TKT-153 integration;
- merge ownership transfer for operations/batches/items, collision-item rebinding to canonical
  evidence, incomplete-operation refusal and a full merge→later dead-letter→survivor Not Ready→retry
  sequence;
- merge SQL orders parent upload-batch transfer before item transfer and leaves collision evidence
  rebinding ownership-neutral until that ordered step;
- multiple completed operation bindings on a merged survivor remain exact by upload key;
- explicit-save continuity snapshot updates draft, persisted baseline and concurrency version while
  preserving dirty field values;
- an explicit Save while a Manual Intake source is dead-lettered remains `needs_review` instead of
  promoting the case from the stale editable field snapshot;
- the eighth failure terminally blocks Manual Intake source evidence while a non-manual evidence row
  at the same attempt count remains pending with capped backoff and no false status recompute;
- the canonical source-evidence readiness blocker and locked EVA submission check;
- picker/server format and size agreement.

## Live proof still required

1. Apply `database/migrations/2026-07-12-tkt166-manual-intake-case-create.sql` before the
   API release, then deploy API and SPA in the documented order.
2. In the deployed SPA, create one disposable document-led case using a PDF instruction, an extra PDF
   and supported photos.
3. Prove the exact selected hashes and roles in Postgres/evidence and the exact bytes in Blob.
4. Prove source readiness remains blocked during an interrupted batch, then clears after retry without
   another case, Case/PO, evidence row or archive folder.
5. Force a disposable source mirror through the terminal retry threshold, prove the case remains Not
   Ready, then use the Evidence retry and prove the same evidence generation resumes.
6. Merge a disposable source case into a survivor before its canonical evidence later dead-letters;
   prove the failure and retry remain on the survivor and the retired case owns no active batch/item.
7. Prove the archive mirror only beneath test root `392761581105`; do not mutate production folders.
8. Prove the persisted instruction can be fetched through the evidence-content/remediation path.

No live resources, Outlook mail or Box content were mutated during this implementation/review pass.

## Independent verification update — 2026-07-14

### Verdict

PENDING

### Evidence per acceptance

- Acceptance 1 — current source uploads the selected instruction and all accepted extras through the
  canonical evidence route with explicit `instruction`/`extra` roles and instruction index
  (`ManualIntake.tsx:776-865`). Server persistence retains filename, hash, content type and
  instruction/other-document kind (`evidence-upload.ts:537-565`). PR 75 (`6ebfb7ea`) is merged.
- Acceptance 2 — browser and server accept only PDF/JPG/PNG/WebP with matching count/size limits
  (`manual-intake-files.ts:1-65`; `upload-validate.ts:12-80,289-312`). Word/email formats were removed.
  The deployed picker exposes the matching list.
- Acceptance 3 — same-tab identities persist in session storage
  (`manual-intake-operation-identity.ts:52-83`). Server binds actor, request hash, upload key, file
  count and instruction index before creation (`cases.ts:907-945`) and returns the committed case on
  replay (`:1029-1086`). Evidence manifests include hash/type/role (`evidence-upload.ts:170-179`) with
  exact-content deduplication and role-conflict refusal (`:300-357`). Live duplicate Case/PO/folder
  behavior remains unproved.
- Acceptance 4 — incomplete or terminally failed source evidence adds a readiness blocker
  (`case-status.ts:345-369`), released only after every selected identity is confirmed
  (`evidence-upload.ts:930-981`). Archive terminal failure queues status recomputation atomically
  (`archive-mirror-outbox.ts:315-359`).
- Acceptance 5 — success reports instruction/extras explicitly; partial failure retains a per-file
  outstanding ledger and retry without claiming files linked (`manual-intake-upload.ts:23-83`;
  `ManualIntake.tsx:940-1040`). Those recovery strings/fields occur in the deployed SPA.
- Acceptance 6 — documents persist as instruction/other-document evidence, images enter
  classifier-owned pending state, and new rows request archive/status work
  (`evidence-upload.ts:537-608`). Stored bytes are available through authenticated content route
  (`evidence.ts:27-61`). Parser/remediation handoff and Archive completion were not exercised.
- Acceptance 7 — both routes require `CollisionSpike.User` (`cases.ts:898-903`;
  `evidence-upload.ts:623-628`). Server rejects empty, oversized, mismatched, corrupt and unsupported
  content before persistence while leaving an already-created case recoverable (`:735-799`).
- Acceptance 8 — request/manifest hashes, per-item SHA-256, replay fencing and exactly-once recovery
  audit are implemented (`manual-intake-operation.ts:19-227`;
  `evidence-upload.ts:98-145,776-816,930-995`).
- Acceptance 9 — committed tests cover role binding, partial/total failure, response loss, replay,
  duplicate content, Archive retry/dead-letter, merges and picker/server parity. Recorded suites are
  Domain 1,138, API 681, orchestration 417 and SPA 483. Independent reruns were unavailable because
  this clean worktree has no local Vitest. Parser handoff still lacks a live artifact.
- Acceptance 10 — production asset `/assets/index-CbUqeEAY.js` is deployed (`Last-Modified:
  2026-07-13 12:48:32 GMT`, SHA-256
  `CEAE61DFE54EC9072E0AE6A154C0066A05FD495FEDA48D8B0560E54B1F8E4A0F`) and contains the TKT-166
  client contract. Unique guarded `/api/cases/{id}/archive-retry` returns 401 unauthenticated, proving
  that API route live. This is not the required disposable-case byte/role/database/Blob/Archive proof.

### Pending / gaps

- No disposable document-led case proved exact selected hashes, roles or bytes through UI,
  PostgreSQL and Blob.
- No interrupted batch proved retry without another case, Case/PO, evidence identity or Archive
  folder.
- No terminal Archive failure/retry or merge-survivor lifecycle was exercised.
- No Archive proof beneath test root `392761581105`.
- No persisted-instruction parser/remediation fetch was exercised.
- Deployment records still leave API/services/orchestration/SPA and designated proof pending, so the later
  live rollout lacks complete artifact provenance.

### How to re-verify

1. Record exact deployed API/SPA/schema artifact identities.
2. Use one authorized disposable case with PDF instruction, extra PDF and supported photos.
3. Capture hashes, roles and bytes in UI, PostgreSQL and Blob; verify Archive only below
   `392761581105`.
4. Exercise response-loss retry, changed selection, duplicate content, terminal Archive retry and
   merge-survivor recovery.
5. Fetch the persisted instruction through the remediation/content path and preserve telemetry/audit.

### Confidence + unread surfaces

HIGH confidence that merged source and TKT-166 SPA/API surfaces are deployed; LOW confidence that all
end-to-end acceptance is live. Unread surfaces are database schema/state, Blob bytes, Archive objects,
deployed API artifact fingerprint, parser handoff and failure/recovery stimuli.
