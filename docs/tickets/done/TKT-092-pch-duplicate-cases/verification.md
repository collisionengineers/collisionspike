# Verification — TKT-092: PCH cases duplicating for no reason

## Verdict
**VERIFIED-LIVE** (2026-07-10, ticket-verifier dispatch — final ruling after the W6 data pass)

## Final ruling (transcribed verbatim, 2026-07-10, post-W6)

All four Acceptance lines now carry live artifacts; W6 closed the last one at 12×. The sole residual
is a fragment of proof-standard class 5 — the *deliberate* redelivery demonstration — which is not an
Acceptance line and is backstopped by a live schema invariant.

- **Line 1 — groups enumerated + vector named with trace: VERIFIED** (precheck + the FW:-re-send
  trace with identical `payload_hash bd1ffccdab05ef13` + the Graph-id-vs-Internet-Message-Id rung-1
  wiring bug; 163-row arithmetic closed).
- **Line 2 — same email can no longer create two cases: VERIFIED** (dedup 22/22 incl. the three
  FW:-resend vectors pinned on the live hash; the internetMessageId key verbatim in the deployed
  bundle; `UNIQUE(source_message_id)` → 409 → `already_ingested` backstop, key-form consistent).
- **Line 3 — existing duplicates merged, audited, re-pointed, provider preserved: VERIFIED-LIVE**
  (W6 Q4 fresh parity: survivors open, 3 casualties retired with `mergedInto`, email counts 3+2;
  the TKT-131 un-retire episode re-fixed + retired-locked under TKT-141 — proof in TKT-141's
  `evidence/reretire-run-100726/` — and Q4 re-confirms the state holds at ~day scale).
- **Line 4 — a fresh PCH intake creates exactly one case: VERIFIED-LIVE at 12×** (W6 Q2: 12 fresh
  PCH mints A.PCH26029→A.PCH26040 over ~36h; W6 Q1 post-fix twin sweep: **0 rows**; the stated close
  condition met twelvefold).

### Residual (recorded honestly — not an Acceptance line)
No live absorb artifact for a redelivery yet: W6 Q3's 35 rows are all evidence-level photo-dedup
script actors (`tkt133-…` ×33, `tkt144-…` ×2 — the actor filter only excluded `delta:%`); zero
organic case-level absorbs; no deliberate replay performed. A true same-message redelivery physically
cannot mint twice (live `UNIQUE(source_message_id)` + 409→`already_ingested`), and the FW:-variant is
pinned offline with the exact live hash — but neither has been *observed* firing live at case level
post-fix. **Redelivery watch:** re-run Q3 with `AND ae.actor NOT LIKE 'tkt%'` added — any remaining
PCH `duplicate_dropped`/`case_attached` row post-2026-07-09T04:00Z is the artifact; or one deliberate
operator re-forward of any PCH instruction → expect no new case + one absorb audit.

### Expected absences (not failures)
YH21HZL + ALS GN14GBE pairs deliberately unmerged (ADR-0010 rung-3 human-decides, flagged for
staff); retired PCH26018/PCH26020 Box folders remain (one-way mirror, operator tidy).

Verified by: ticket-verifier dispatch, 2026-07-10 (orchestrator ruling: the residual is outside the
Acceptance's letter — moved to done with the redelivery watch recorded above).

---

## Initial sweep verdict (2026-07-10, pre-W6 — superseded by the final ruling above)
**PENDING** — lines 1–3 proven; the remaining tail is exactly the ticket's class-5 live probe,
**now closable by queued SQL alone** (the fix has had ~36h of live PCH traffic): close when Q1
returns 0 rows AND Q2 returns ≥1 row.

## Sweep verdict (transcribed verbatim, 2026-07-10)

- **Line 1 — duplicate groups enumerated + vector named with trace: VERIFIED.**
  `evidence/data-fix-precheck-2026-07-09.txt` enumerates the one real PCH group (PK20FWT /
  00035591/JEFFP ×3: PCH26009/PCH26018/PCH26020) + the QCL 226070.TA pair. Vector named with trace:
  NOT multi-mailbox, NOT Graph-499 redelivery — a provider FW:-re-send where PCH26018/PCH26020
  carried the IDENTICAL `payload_hash` yet both minted, and the parser ref matched open PCH26009 yet
  didn't attach; plus the real wiring bug — `caseResolve` passed the Graph message id where
  `seenMessageIds` holds Internet-Message-Ids.
- **Line 2 — same email can no longer create two cases: VERIFIED.** dedup.test.ts **22/22** re-run
  this pass incl. the 3-test "TKT-092 FW:-resend vectors" suite (same hash → drop; same parser ref →
  attach to PCH26009; different ref → new_due_to_reference). Mechanism in source
  (`caseResolve.ts:74-89` keys rung 1 on `internetMessageId || messageId`, `parserRef` folded into
  `candidateRef`) and verbatim in the deployed bundle; `UNIQUE(source_message_id)` 409 →
  `already_ingested` persist backstop. Orch redeployed 5× since the fix — the live app runs this
  code.
- **Line 3 — existing duplicates merged/voided, audited, re-pointed, provider preserved:
  VERIFIED-LIVE (via TKT-141, 2026-07-10).** Applied 07-09 (survivor PCH26009 3 emails / 163
  evidence; providers intact; backup + audits). Honest history: this state regressed same-day
  (TKT-131's re-evaluate un-retired the 3 casualties — no retired-lock existed); re-fixed + re-proven
  2026-07-10 (re-retire delta + the retired-lock in `case-status.ts:239`; SPA + SQL parity
  PK20FWT=1, stable through live churn) — see TKT-141's verification + `evidence/reretire-run-100726/`.
- **Line 4 — a fresh PCH intake creates exactly one case (live probe): PENDING — the only open
  line.** Circumstantial evidence strong (54 pch-ltd.com matches/26h zero exceptions; mints through
  PCH26036; drain mint-guards proven; no new PK20FWT/YH13ZSN twin) but no artifact yet enumerates
  post-fix PCH mints as twin-free.

### Close condition (queued SQL — next data pass)
**The ticket closes when Q1 = 0 rows AND Q2 ≥ 1 row.** The redelivery half closes with one organic
Q3 hit (non-`delta:%` PCH `duplicate_dropped`/`case_attached` audit post-fix) or a deliberate
operator replay → `already_ingested`.

```sql
-- Q1: post-fix PCH twin sweep — EXPECT 0 rows
WITH pch AS (
  SELECT c.id, c.case_po, c.case_ref, c.vrm, c.created_at
  FROM case_ c JOIN work_provider wp ON wp.id = c.work_provider_id
  WHERE wp.principal_code = 'PCH'
    AND COALESCE(c.duplicate_keys::text,'') NOT LIKE '%mergedInto%'
    AND c.status_code NOT IN (100000006))
SELECT a.case_po, b.case_po, a.vrm, a.case_ref, b.case_ref, a.created_at, b.created_at
FROM pch a JOIN pch b ON a.id < b.id
 AND ((NULLIF(btrim(a.vrm),'') IS NOT NULL AND a.vrm = b.vrm)
   OR (NULLIF(btrim(a.case_ref),'') IS NOT NULL AND a.case_ref = b.case_ref))
WHERE GREATEST(a.created_at, b.created_at) >= '2026-07-09T04:00:00Z';
-- Q2: fresh PCH mints since the fix — EXPECT >= 1
SELECT c.case_po, c.vrm, c.case_ref, c.created_at, c.status_code
FROM case_ c JOIN work_provider wp ON wp.id = c.work_provider_id
WHERE wp.principal_code = 'PCH' AND c.created_at >= '2026-07-09T04:00:00Z' ORDER BY 4;
-- Q3: absorbed repeats post-fix (organic, non-delta)
SELECT ae.occurred_at, ae.actor, left(ae.name,70), ae.action_code, c.case_po
FROM audit_event ae LEFT JOIN case_ c ON c.id = ae.case_id
LEFT JOIN work_provider wp ON wp.id = c.work_provider_id
WHERE ae.action_code IN (100000004,100000005) AND ae.occurred_at >= '2026-07-09T04:00:00Z'
  AND COALESCE(ae.actor,'') NOT LIKE 'delta:%' AND wp.principal_code = 'PCH' ORDER BY 1;
-- Q4: ticket-sample parity (survivors open; 3 casualties retired + mergedInto; email counts 3 and 2)
SELECT id, case_po, case_ref, vrm, status_code, on_hold, left(duplicate_keys::text,60) FROM case_
WHERE id IN ('68442a2a-998c-4a16-89ba-8fe226303734','cd9092ce-1956-4df3-80d3-6cc77ee31d9f',
 '19b96214-4770-4ea7-ac56-c63741a4f430','be1a0a11-8a22-4fef-a0e6-878090360f0c',
 'd1d862bd-1ae4-4028-b81e-392ff6a75029');
SELECT case_id, count(*) FROM inbound_email
WHERE case_id IN ('68442a2a-998c-4a16-89ba-8fe226303734','be1a0a11-8a22-4fef-a0e6-878090360f0c')
GROUP BY 1;
```

### Expected absences (not failures)
YH21HZL (PCH26005/PCH26008) + the ALS GN14GBE pair deliberately unmerged (differing refs — ADR-0010
rung-3 human-decides, flagged for staff); retired duplicates' Box folders still exist (one-way
mirror, operator tidy); the TKT-131 un-retire episode is a different ticket's bug, fixed + locked
under TKT-141 (done). Note: line 3's current proof lives in TKT-141's evidence folder.

### How to re-verify
Q1–Q4 above; offline dedup.test.ts (22/22); deployed-bundle grep
`internetMessageId || inbound.messageId`.

Verified by: ticket-verifier dispatch, 2026-07-10.
