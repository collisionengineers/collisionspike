# Live blank-claimant census — 2026-07-12

> **Dated baseline, not current state.** Preserve this read-only 132-case snapshot for the
> source/first-loss trail; a fresh census is required before any remediation.

Read-only owner-equivalent census using `PGOPTIONS='-c app.role=staff'`. Database work ran inside
`BEGIN TRANSACTION READ ONLY`; Outlook and Archive reads were read-only. No case, evidence, mailbox,
or Archive item was changed. The temporary PostgreSQL firewall rule was removed; final readback
showed only `AllowAzureServices`.

## Active baseline

| Queue under the pre-TKT-130 live mapping | Cases |
|---|---:|
| Held | 57 |
| Not Ready | 24 |
| Review | 51 |
| **Total** | **132** |

All 51 blank-claimant cases in Review are stored as `needs_review`, are not on hold, and violate the
superseding readiness contract. All 132 have deterministic classification, an inbound-email row,
and a retained mailbox/message key. None has claimant-name field provenance.

### Provider rollup

- Held: unresolved 21, QDOS 19, Fairway 4, AX 3, Kerr Brown 2, Oakwoods 2, QCL 2, and one each for
  Auto Logistic Solutions, Performance Car Hire, Smart Business Link, and Ten Legal.
- Not Ready: QDOS 7, Montreal Prestige 4, Performance Car Hire 3, KMR 2, Oakwoods 2, and one each for
  AX, Baker Coleman, Fairway, QCL, Robert James Solicitors, and Swan.
- Review: QDOS 26, Fairway 10, Auto Logistic Solutions 4, Performance Car Hire 3, Swan 2, and one
  each for Accident Specialists, Baker Coleman, Knightsbridge, Montreal Prestige, Savas & Savage,
  and Smart Business Link.

### Intake and source rollup

| Queue | Stored status | Intake | Count |
|---|---|---|---:|
| Held | error | email | 2 |
| Held | error | retro | 1 |
| Held | missing_required_fields | email | 4 |
| Held | missing_required_fields | retro | 1 |
| Held | needs_review | email | 3 |
| Held | needs_review | retro | 46 |
| Not Ready | missing_required_fields | email | 24 |
| Review | needs_review | email | 51 |

Email accounts for 84 cases and retro reconstruction for 48. Primary retained-source families are:
11 legacy DOC, 2 DOCX, 64 PDF, 54 email-body artifact, and 1 with no instruction artifact. The last
case remains rerunnable from its mailbox source. In total, 72 retain an instruction in Blob, 59 in
Archive, and one is mailbox-only; **0/132 lack every rerunnable source**. Parser/engine version was
not persisted per case, so no per-row version claim is possible.

An obvious labelled claimant/client field appears in the retained preview for 27 cases. The other
105 require full document/EML replay; a truncated preview is not evidence that the source is blank.

## QDOS26079 trace

- Case/PO `QDOS26079`. The case UUID, registration, mailbox/message identifiers, and timestamps are
  intentionally omitted from this committed summary; a fresh operator trace must keep them only in
  the gitignored external/raw evidence set.
- Stored `needs_review`, `on_hold=false`, therefore incorrectly in Review under the pre-fix mapping.
- Claimant and claimant overview blank; claimant provenance rows: 0.
- One linked inbound row was present in the production mailbox set.
- Retained active sources comprised one legacy DOC (44,032 bytes) and its original EML
  (3,249,096 bytes).
- Both sources were verified beneath authorised test root `392761581105`; exact evidence, file, and
  case-folder identifiers are deliberately kept out of Git.

### First loss stage

The original message contains an explicit labelled claimant/client value. The dated telemetry trace
(operation identifiers omitted from Git) showed orchestration invoke the legacy DOC and the parser
return 422 because the deployed Linux host had no Word, LibreOffice, or antiword reader.
Orchestration skipped that candidate and created the case from the empty parse result. The claimant
was therefore lost at document read, before persistence; Postgres did not discard a non-empty value.

## Safe remediation contract

After the legacy-DOC/runtime fix is live, snapshot these 132 case IDs and replay only their retained
original sources. Fill claimant only when the current field is blank, preserve every staff value,
write source provenance and a before/after audit event, then run the canonical readiness evaluator.
Use case ID plus canonical Internet Message-ID/evidence ID as the idempotency key. The residual
ledger must account for every baseline row as exactly one of `repaired`, `absent_in_source`,
`conflicting`, or `failed`, with an actionable reason.

## Census predicate

```sql
WITH base AS (
  SELECT c.*, cs.name AS status_name,
    CASE
      WHEN c.on_hold OR cs.name IN ('error', 'duplicate_risk') THEN 'Held'
      WHEN cs.name IN ('new_email', 'ingested', 'missing_images',
                       'missing_required_fields', 'linked_to_instruction') THEN 'Not Ready'
      WHEN cs.name IN ('needs_review', 'ready_for_eva') THEN 'Review'
    END AS queue_name,
    (c.status_code = 100000006
      AND COALESCE(c.duplicate_keys, '') ~ '"mergedInto"[[:space:]]*:') AS retired_merge
  FROM case_ c
  JOIN choice_case_status cs ON cs.code = c.status_code
)
SELECT queue_name, count(*)
FROM base
WHERE queue_name IS NOT NULL
  AND NOT retired_merge
  AND NULLIF(btrim(eva_claimant_name), '') IS NULL
GROUP BY queue_name
ORDER BY queue_name;
```
