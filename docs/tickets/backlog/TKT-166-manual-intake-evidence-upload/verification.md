# Verification — TKT-166: Persist instruction and extra files from Manual Intake

## Verdict

TESTED (offline) — implementation and independent-review fixes pass the complete local suites.
Deployment and the ticket-required disposable live-case proof remain owned by the dispatching loop.

## Offline evidence

- Domain: **56 files / 1,136 tests passed**.
- Data API: **64 files / 634 tests passed**.
- Orchestration: **30 files / 417 tests passed**.
- SPA: **41 files / 464 tests passed**.
- Focused independent-review run: Domain **42**, API **62**, SPA **62** tests passed.
- Production TypeScript builds passed for Domain and the Data API; the SPA TypeScript/Vite build
  produced a production bundle.
- `node verify-all.mjs`: **8 passed / 0 failed / 13 expected skips**.
- `git diff --check` passed before both review-fix commits.

Regression coverage includes:

- retry identity surviving a same-tab reload and rotating only for an intentional new draft;
- one case/Case-PO under exact replay and response-loss retry;
- instruction/extra/image roles bound into the manifest and persisted distinctly;
- exact-content dedup plus instruction-role promotion;
- partial, total, stale-binding and already-complete outcomes;
- batch-result audit records for refusal, partial completion and eventual recovery;
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
5. Prove the archive mirror only beneath test root `392761581105`; do not mutate production folders.
6. Prove the persisted instruction can be fetched through the evidence-content/remediation path.

No live resources, Outlook mail or Box content were mutated during this implementation/review pass.
