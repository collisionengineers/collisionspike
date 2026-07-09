---
id: TKT-087
title: Box report shows 409 upload conflicts — investigate duplicate archive attempts
status: verify
priority: P2
area: box
tickets-it-relates-to: [TKT-003, TKT-092]
research-link: docs/tickets/verify/TKT-087-box-upload-409-conflicts/evidence/operator-note.md
---

# Box report shows 409 upload conflicts — investigate duplicate archive attempts

## Problem

The operator pulled a Box API report for the `collisionspike` app and asked why it shows errors
and whether they are concerns. Distiller's analysis of the CSV (300 calls, all 2026-07-03):

- 241 × `201` (creates) and 41 × `200` (folder GETs) — healthy.
- **18 × `409` on `POST upload`** — Box returns 409 for `item_name_in_use`: the app tried to
  upload a file whose name already exists in the target folder.

Two possible readings, with very different severity: (a) **benign** — the archive path re-ran and
Box correctly refused a duplicate (idempotency working, nothing lost); (b) **symptom** — intake
is processing the same email/evidence twice (double webhook delivery, retry after a 499
cold-start abort, or the PCH case-duplication in TKT-092), and the 409s are the visible edge of a
duplication bug. Also unverified: whether the code path *handles* 409 (treats as
already-archived) or logs it as a failure and skips linking the evidence row to the Box file.

## Evidence

- `evidence/operator-note.md` — verbatim drop-note.
- `evidence/boxreport.csv` — the Box API report (App Name, status, resource, method, timestamp;
  18 × 409 POST upload rows on 2026-07-03).
- Archive path: the orchestration `boxArchiveEvidence` lane (TKT-003, verified live 2026-07-01).

## Proposed change

PROPOSED (not built):

- Correlate the 18 × 409 timestamps against App Insights orch traces and Postgres
  evidence/audit rows: which cases/files conflicted, and were they legitimately already
  archived?
- Determine whether the same intake ran twice for those emails (cross-check TKT-092's PCH
  duplication — same-day evidence would tie the two).
- Code check: make the upload path explicitly idempotent — on 409, resolve the existing file id
  and link it to the evidence row (no lost linkage, no error-level noise); add a unit test.
- Write up the verdict (benign vs bug) in this folder; if a duplication vector is found, fix or
  ticket it explicitly.

## Acceptance

- [ ] Each of the 18 conflicts is attributed to a case + file with a stated cause.
- [ ] The upload path treats 409 as "already exists": existing file id linked, warn-level trace,
      covered by a unit test.
- [ ] A written verdict exists: either "benign idempotency, no data loss (proven by evidence-row
      → Box-file linkage checks)" or the duplication vector named + fixed/ticketed.

## Verification requirements (proof standard — all classes required before `done`)

1. **Trace correlation** — the 409 request timestamps matched to orch invocations/audit rows,
   recorded in [verification.md](./verification.md).
2. **Data proof** — for every conflicted file: the evidence row exists and links a valid Box file
   (no orphaned/unlinked evidence).
3. **Offline test** — unit test for the 409-idempotent upload behaviour green.
4. **Gate + deploy** — `node verify-all.mjs` green; orch deploy recorded in
   [changes.md](./changes.md) (if code changed).
5. **Live re-check** — a fresh Box report (or App Insights window) after the fix shows 409s only
   where a genuine re-archive occurred, each absorbed idempotently.

## Research

Distilled 2026-07-06 from the operator drop-note folder `to-distill/BOXreport/`; raw material in
[evidence/](./evidence).

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
