# Changes — TKT-092: PCH cases duplicating for no reason

## Status
Vector named with trace evidence; hardening + data fix deployed/applied live (2026-07-09,
PLAN-003 intake-correctness wave).

## Enumeration + vector (data-traced — evidence/data-fix-precheck-2026-07-09.txt)

Duplicate sweep over all providers found ONE PCH group (and one QCL group; the QDOS "pairs" are the
legitimate report+audit dual shape): **PK20FWT / ref 00035591/JEFFP × 3** — PCH26009 (07-02),
PCH26018 (07-03 13:39), PCH26020 (07-03 14:19).

**The vector is NOT multi-mailbox double-intake and NOT Graph 499 redelivery** — all three arrivals
came via info@ with DISTINCT Internet-Message-Ids. It is the **same instruction re-sent as "FW:"**
by the provider (colette.woods@pch-ltd.com). Two misses let it duplicate on the then-deployed build:
1. PCH26018 vs PCH26020 carry the **IDENTICAL payload_hash** (`bd1ffccdab05ef13`) yet both minted —
   the rung-1 hash guard did not fire on the 2026-07-03 build;
2. the re-sends' parser ref (00035591/JEFFP) matched the open PCH26009's case_ref yet did not
   attach — the ladder's ref key did not carry the parser ref then.
Additionally a REAL live bug was found in the current activity wiring: `caseResolve` passed the
**Graph message id** into the ladder while `seenMessageIds` holds **Internet-Message-Ids** — the
message-id repeat rung could NEVER match a redelivery.

## Shipped

- **Intake idempotency key fix** (`services/orchestration/src/workflows/intake/caseResolve.ts`): the
  rung-1 key is now `inbound.internetMessageId` (falling back to the Graph id) — redelivery/
  cross-mailbox repeats now hit the message-id rung BEFORE the persist-time UNIQUE backstop.
- **Regression tests** (`packages/domain/src/domain/dedup.test.ts` — "TKT-092 FW:-resend vectors"):
  same payload hash + new message id → `drop`; same parser ref + new hash → `attach` to the open
  case; different ref on the same VRM → `new_due_to_reference` (never merged).
- **Merge hardening** (`services/data-api/src/features/cases/` mergeCases): now also re-points the source's
  `inbound_email` rows to the survivor, and applies the TKT-052 provider preference (see that
  ticket) — used by staff merges going forward.
- **Data fix** (`deltas/2026-07-09-intake-wave-data-fixes.sql` §B/§C, APPLIED LIVE, backup table
  `backup_20260709_intake_wave`): PCH26018 + PCH26020 merged into **PCH26009** (evidence + emails
  re-pointed — survivor now holds 3 emails / 163 evidence rows; sources retired
  `linked_to_instruction` with `mergedInto` markers; audited `case_attached` rows on the survivor);
  the QCL pair (226070.TA) merged the same way. Providers preserved on all survivors.
  Post-check: evidence/data-fix-postcheck-2026-07-09.txt.

## Deploy + data state
orch redeployed (70 fns), api redeployed (89 fns); delta applied live. Registry updated
(2026-07-09T04:45Z).

## Remainders (honest)
- The **YH21HZL pair (PCH26005 "Excess waived" / PCH26008 EHR103043)** and the **ALS GN14GBE pair**
  were NOT merged — their refs differ, which is exactly the ADR-0010 rung-3 "duplicate risk, human
  decides" shape; left for staff with the duplicate flags they already carry.
- Live probe ("a fresh PCH intake creates exactly one case; a deliberate redelivery still one") —
  requires the next live PCH re-send; the domain tests + the message-id-key fix cover it offline.
  Verifier item.
- The retired duplicates' Box folders (PCH26018/PCH26020) still exist in Box (one-way mirror — never
  auto-deleted); operator may tidy.
