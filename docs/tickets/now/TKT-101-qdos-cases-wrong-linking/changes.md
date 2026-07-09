# Changes — TKT-101: QDOS two refs wrongly linked as one case

## Status
Vector confirmed, guard deployed, live case split + rebuilt (2026-07-09, PLAN-003 intake wave).

## Linking-key vector (confirmed from data)

Case **QDOS26056** (`8c7cbc8e…`) was created 2026-07-06 21:24 from "46533/1 - Barry Pavlou."
(desk@). Thirteen minutes later "46671/1 - Michael McCarthy" arrived; both emails had sniffed the
**junk VRM `AND2`** (engine v2.7 — "Offices 1 and 2…"; both `body_vrm` values were cleared by the
2026-07-09 vrm-junk cleanup), the case's own `case_ref` was EMPTY (no parsable doc → nothing for the
ref arm to match), so **`linkReply`'s VRM arm auto-linked the second ref onto the first's case**
(the inbound row went `routed` with `case_id = QDOS26056`). Upstream the AND2 extraction is dead
(engine-v2.10), but a genuinely shared registration (fleet/courtesy car) could reproduce the shape.

## Shipped

- **linkReply reference veto** (`api/src/functions/internal.ts` + new
  `api/src/lib/link-guards.ts`): a VRM-only single hit is now REFUSED when the incoming email cites
  a job/claim reference that conflicts with everything the candidate case is known as (its
  `case_ref`/`case_po` + the `body_jobref`s of its already-linked emails) — ADR-0010 rung-3
  semantics applied to the link seam. The refusal audits `duplicate_flagged` and returns
  `no_match`, so the retro ladder can still resolve the mail correctly.
- **Regression pins:** `api/src/lib/link-guards.test.ts` (the live 46533/1-vs-46671/1 shape; match
  via any known ref; no-reference and no-known-refs pass-through) and
  `packages/domain/src/domain/dedup.test.ts` ("TKT-101 shape: different ref on the same VRM →
  new case + duplicate risk, never merged").
- **Audited un-merge/split** (`deltas/2026-07-09-intake-wave-data-fixes.sql` §D, APPLIED LIVE):
  the 46671/1 email (`86b0dc6d…`) detached from QDOS26056 (back to triage `new`), audited
  `inbound_detached` on the case. Evidence check confirmed ALL 12 evidence rows on QDOS26056 were
  created in the 46533 processing window (21:24:25–21:25:10) — nothing to move.
- **Two separate cases — live:** the retro drain (`POST /api/retro-case`) rebuilt 46671/1 as its
  OWN case — orchestration Completed `{outcome: created, caseId: 6cd60114-f577-41e8-9eea-43d17e14a536,
  source: outlook}` (Held, case_ref 46671/1, no PO minted — Outlook-rung semantics). QDOS26056
  remains 46533/1's case.

## Deploy + data state
api redeployed (89 fns); delta applied live (backup table `backup_20260709_intake_wave`);
drain instance recorded. Registry updated 2026-07-09T04:45Z.

## Remainders (honest)
- The rebuilt 46671/1 case is Held `needs_review` without a QDOS PO (retro never mints) — staff
  confirm and assign, same as any Held reconstruction.
- 46670/1 and 46640/1 (same batch, never linked anywhere) remain un-linked in triage — they now
  qualify for the same drain; listed as backlog-drain candidates in the TKT-119 memo.
