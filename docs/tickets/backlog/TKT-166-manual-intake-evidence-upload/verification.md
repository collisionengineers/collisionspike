# Verification — TKT-166: Persist instruction and extra files from Manual Intake

## Verdict

TESTED (offline) — implementation and independent-review fixes pass the complete local suites.
Deployment and the ticket-required disposable live-case proof remain owned by the dispatching loop.

## Offline evidence

- Domain: **56 files / 1,138 tests passed**.
- Data API: **64 files / 642 tests passed**.
- Orchestration: **30 files / 417 tests passed**.
- SPA: **41 files / 468 tests passed**.
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
- the canonical source-evidence readiness blocker and locked EVA submission check;
- picker/server format and size agreement.

## Live proof still required

1. Apply `migration/assets/schema/deltas/2026-07-12-tkt166-manual-intake-case-create.sql` before the
   API release, then deploy API and SPA in the documented order.
2. In the deployed SPA, create one disposable document-led case using a PDF instruction, an extra PDF
   and supported photos.
3. Prove the exact selected hashes and roles in Postgres/evidence and the exact bytes in Blob.
4. Prove source readiness remains blocked during an interrupted batch, then clears after retry without
   another case, Case/PO, evidence row or archive folder.
5. Force a disposable source mirror through the terminal retry threshold, prove the case remains Not
   Ready, then use the Evidence retry and prove the same evidence generation resumes.
6. Prove the archive mirror only beneath test root `392761581105`; do not mutate production folders.
7. Prove the persisted instruction can be fetched through the evidence-content/remediation path.

No live resources, Outlook mail or Box content were mutated during this implementation/review pass.
