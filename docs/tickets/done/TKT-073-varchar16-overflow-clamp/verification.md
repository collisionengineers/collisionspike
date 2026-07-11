# Verification — TKT-073: Intake write fails with "value too long" — clamp over-length field before insert

## Verdict
VERIFIED-LIVE

Verified by: ticket-verifier dispatch, 10-07-26.

## Ticket-verifier verdict (transcribed, dispatch of 2026-07-10)

1. **Failing field identified + named with KQL evidence** — independently corroborated: exactly 21
   `value too long` error traces all-time on the api component, matching changes.md row-for-row
   (varying(100) on internalCasesResolve 06-30→07-01; varying(16) on internalCasesResolve
   07-02→07-03; varying(16) on internalRetroCreate 07-07).
2. **Over-length no longer fails the insert; warn trace records it** — 9 live clamp warns observed
   (`[retro/create] over-length VRM candidate dropped (junk sniff > varchar(16))`, 2026-07-09
   04:36:32Z → 2026-07-10 15:41:18Z, 7 during today's drain burst); the same lanes returned ZERO
   5xx (internalRetroCreate 76/76, internalCasesResolve 109/109, internalInboundEmail 296/296,
   internalCasesEvidence 1,775/1,775 across the window). VRM semantics: dropped to '' by design
   (junk must not become a correlation key); case_ref truncated. Guard seams code-read:
   varchar-guard.ts wired at internal.ts:389/918/992/1281-1297 + internal-retro.ts:269/352.
3. **Unit test pins the clamp** — verifier's own run: varchar-guard.test.ts 8/8 passed.
4. **Zero recurrence, window recorded** — totalHits=21, lastSeen frozen 2026-07-07T16:24:28Z,
   postDeploy(>2026-07-09T04:36Z)=0. **Retention floor honestly probed: traces reach back to
   2026-06-26** — the query provably CAN see these errors (it found all 21 originals) and sees none
   after deploy, over ~16k api requests incl. the 34-case drain + ~121 intakes + 1,204 evidence
   writes. Exceptions: api 0, orch 0 of 1,052.
- Expected absences: no candidateRef clamp warn post-deploy (no over-length ref arrived — the
  ticket explicitly allows a none-arrived note; the VRM lane has real warns instead).
- Upstream hygiene (parser/sniff emitting >16-char junk tokens at all) = sibling-engine follow-up,
  out of scope, as changes.md notes.

Queued SQL (corroborative only): the two refs lost to the 07-07 pre-fix failures (expect present
after the post-fix drain); count of empty-VRM cases since 07-09 (the 9 dropped-VRM landings).

## How to re-verify
The KQL bundle in the verdict (recurrence summary — expect lastSeen frozen + postDeploy 0; clamp
warns; per-lane denominators) + the 8-test offline run.

## Pending / gaps
Implementation not started.

## How to re-verify
Per the ticket's **Verification requirements**: unit test pinning the clamp; verify-all + deploy
recorded; post-deploy KQL over a stated window showing zero `value too long … varying(16)`
recurrences; one clamp warn-trace observation (or an honest none-arrived note).
