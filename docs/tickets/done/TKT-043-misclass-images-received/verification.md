# Verification — TKT-043: Images-received / report-chaser email misrouted (images-on-existing-case)

## Verdict
**PENDING** (2026-07-10, ticket-verifier dispatch) — deployed, firing live, every component of the
seam live-proven; the one missing artifact is a single real arrival combining the full sample shape
(work-shaped + single open-case **job-ref** match + images-only). Nothing FAILED.

## Sweep verdict (transcribed verbatim, 2026-07-10)

All KQL against orch App Insights `7c7ea68a…`, 7d window (2026-07-03→10).

- **AC1 (sample routes `case_update`/`images_received` via open-case-ref context — offline): MET.**
  `baseline-v2.json` row `tkt043-images-existing-case` correct on category + subtype, driven by the
  fed `open_case_ref_match: "one"` context signal (kill-switch documented); deterministic domain
  tests at `triage-policy.test.ts:521,545,578`. **Live corroboration of the mechanism:** 131
  `ref_gate` triage_decisions in 7d; **39 had Stage-A `receiving_work/*` and were relabelled
  `case_update`** (`caseUpdateApplied=true`), incl. one to **`images_received`** (2026-07-10
  10:57:03Z, desk@, imagesOnly=true, vrm tier ×2 matches → suggest_attach, correctly
  suggestion-only per the ADR-0010 VRM invariant).
- **AC2 (suggest-first/auto attach via TKT-093 machinery; no new case minted): LIVE-PROVEN at the
  orchestration layer.** Exact per-instance join (`intake-<messageId>` trace prefix): **55
  `attach_case` decisions in 7d (44 post-fix-deploy) → 0 ran `caseResolve` in the same intake
  instance**, against 282 caseResolve mints in other instances (control). **9 post-deploy instances
  are the work-shaped arm specifically** — Stage-A `receiving_work` + single job_ref open-case match
  → `attach_case` + `case_update/update_general`, no mint (07-08 12:50:51Z/13:13:13Z; 07-09
  07:25:14Z/08:25:40Z/09:03:44Z/10:35:34Z/11:20:38Z/12:55:50Z/13:15:43Z). TKT-093's attach machinery
  separately VERIFIED-LIVE today.
- **AC3 (no regression): offline-consistent** — baseline matches the claimed flip; `--check` clean;
  `receiving_work` recall ~94% held; `intake-routing.test.ts:11` pins
  `CASE_MINTING_CATEGORIES === ['receiving_work']`.
- **AC4 (deployed live under existing gates + live proof on a real open-case-ref chaser):** all four
  TRIAGE_* gates `true` (LIVE_FACTS); new-shape telemetry emitting; **`images_received` fires live**
  (10 rows/7d) incl. one `attach_case` on a single job_ref match (2026-07-09 14:17:59Z, engineers@ →
  case `571ea8bb…`, no mint in-instance) — but that arrival's Stage-A was already
  `case_update/images_received`, so it does not prove the *relabel-from-work* seam. **The precise
  conjunction has not recurred.**
- **AC5 (changes.md + evidence recorded): MET.**

### Pending / gaps
**Expected absence (the only real pending item — an arrival shape, not a bug):** no single live
arrival yet combining Stage-A `receiving_work` + exactly ONE open-case job/case-ref match +
images-only evidence → `attach_case` + `case_update/images_received` + attach-no-mint. Each pairwise
combination is live-proven (work+job_ref+attach+no-mint ×9 all `update_general`; work+images_received
×1 vrm/ambiguous → suggestion; images_received+job_ref+attach ×1 Stage-A already case_update).

Notes (not bugs): the FILENAME-tier imagesOnly (photos-in-a-PDF) has no distinguishable live specimen
(telemetry carries no filename dims; offline pins cover it). The 07-10 10:57Z ambiguous-vrm arrival
**did mint** via the documented suggest-first fall-through (`intakeOrchestrator.ts:226-230`) — out of
this ticket's shape; the non-minting belt protects the attach_case arm, exactly as changes.md Finding
A/B state. DB legs unqueried (firewall) — queued SQL below.

### Queued SQL (next data pass; corroborative, not decisive)
```sql
-- attach arm on the 2026-07-09T14:17:59Z images_received attach (case 571ea8bb-…):
SELECT ae.action_code, ae.case_id, left(ae.name,80), ae.occurred_at FROM audit_event ae
WHERE ae.case_id = '571ea8bb-5ebe-44fb-a25d-c9e12a703803'
  AND ae.occurred_at BETWEEN '2026-07-09T14:17:00Z' AND '2026-07-09T14:25:00Z' ORDER BY ae.occurred_at;
SELECT c.id, c.case_po, c.created_at FROM case_ c
WHERE c.created_at BETWEEN '2026-07-09T14:17:30Z' AND '2026-07-09T14:20:00Z';
SELECT s.suggestion_type, s.review_state, s.case_id, s.created_at FROM ai_suggestion s
WHERE s.created_at BETWEEN '2026-07-10T10:57:00Z' AND '2026-07-10T10:58:00Z';
```

### Fastest close (operator smoke)
Send a chaser to info@/engineers@/desk@ naming an OPEN case's job ref with a photos-PDF attached →
expect `triage_decision`: `attach_case`, `case_update`/`images_received`, `matchTier=job_ref`,
`caseUpdateApplied=true`, `imagesOnly=true`; no `caseResolve` in `intake-<messageId>`.

Doc nit (for the playbook, not this ticket): `logs-kql.md`'s "`operation_Id == "intake-<message-id>"`"
is stale for the current SDK — the instance id appears as a message prefix instead.

### W6 data-pass results (orchestrator-run, 2026-07-10 — the queued SQL)
- The 2026-07-09 14:17:59Z images_received attach on case `571ea8bb…` is fully audited in the DB:
  "A message was suggested for linking" + "Inbound email linked to case (auto-attach)" same-second,
  then "classified + persisted 6 evidence row(s)", 4 box_upload_received rows, and
  "archived 6/6 evidence file(s)" — the attach→evidence→archive chain complete.
- The only case created in the ±2.5-min window is A.PCH26030 (14:18:48) — an unrelated PCH
  instruction arriving coincidentally (it is TKT-092-Q2's legitimate mint), NOT a mint from the
  attach; the no-mint conclusion stands.
- The 10:57Z ambiguous-vrm arrival produced two case_link suggestion rows at 10:57:03 (one pending,
  one accepted 0.15s later) — the documented suggest-first fall-through shape.
Verdict stands PENDING on the exact three-way conjunction.

Verified by: ticket-verifier dispatch, 2026-07-10.

## Prior verdict (2026-07-08, superseded)
PENDING (implementer cannot self-certify — offline proof is green; live proof to be gathered
by the ticket-verifier).

## Evidence (offline — done)
- `scripts/evaluation/email/baseline-v2.json` (regenerated, `--taxonomy v2 --check` clean): eval item
  `tkt043-images-existing-case` flipped `receiving_work`/`existing_provider_instruction` →
  `case_update`/`images_received` (`category_correct` + `subtype_correct` both true) driven by a
  genuine `open_case_ref_match: "one"` context signal, not a hard-code (kill-switch: absent/`none`
  still classifies `receiving_work`). No other of the 52 scored items moved; `receiving_work`
  recall held ~94%. Detail: `evidence/offline-eval-delta.md`.
- `packages/domain/src/domain/triage-policy.test.ts` (952 domain tests green) — the real tkt043
  shape asserts `case_update`/`images_received` + `case_link` + targetCaseId, and `attach_case`
  (the TKT-093 reversible `inbound_linked` attach) under `autoAttach`. `intake-routing.test.ts`
  pins `case_update` non-minting (no new Case).
- Parser classifier suite 179 green (3 new tkt043 pins); orch suite 168 green (3 new
  `deriveAttachmentSignals` pins). `verify-all.mjs` green on Orchestration (tsc + vitest) and
  Domain (vitest) — the only FAIL is the known-environmental `test_multiformat_extraction`
  (`No module named 'fitz'`/PyMuPDF absent), unrelated to classification.
- Deployed: `.artifacts/deploy/orchestration/main.cjs` published to `cespk-orch-dev` (Windows func 4.12); live
  function count re-verified **67** (unchanged — no new trigger), `triagePolicy` present.

## Pending / gaps (live proof for the verifier)
Gates are already live (per `LIVE_FACTS.json`: `TRIAGE_REF_GATE_ENABLED`,
`TRIAGE_CASE_UPDATE_ENABLED`, `TRIAGE_IMAGES_ROUTING_ENABLED`, `TRIAGE_AUTO_ATTACH_ENABLED` all
`true`), so no gate flip is pending — only live proof on a real open-case-ref chaser.

Two live prerequisites the verifier should confirm hold on the target case:
1. The chaser's ref (`Ref 160404`-shaped job ref) actually resolves to ONE OPEN case in
   `/api/internal/triage/context` (the messy `bodyJobref` "160404/GN14GBE/…" must match a case's
   job ref, or `candidateRef` supplies a cleaner value). If it resolves to none → the item stays
   a query (correct) and this specific sample won't prove the attach live.
2. `imagesOnly` for a photos-PDF now derives `true` via `deriveAttachmentSignals` — verify the
   `triage_decision` customEvent shows `actingFinalSubtype = images_received`.

## How to re-verify (live)
1. **App Insights / KQL** (`cespk-orch-dev`): the always-on decision event —
   ```kql
   customEvents
   | where name == "triage_decision"
   | where timestamp > ago(2h)
   | extend d = parse_json(tostring(customDimensions))
   | where d.actingFinalCategory == "case_update"
   | project timestamp, d.actingAction, d.actingFinalCategory, d.actingFinalSubtype, d.messageId
   ```
   Expect `actingAction` ∈ {`attach_case`,`suggest_attach`}, `actingFinalCategory == case_update`,
   `actingFinalSubtype == images_received` on a real open-case-ref chaser.
2. **Postgres** (Entra admin → `SET ROLE csadmin`; see memory/live-postgres-connect-path) — the
   reversible link suggestion + attach:
   ```sql
   SELECT s.suggestion_type, s.status, s.suggested_value, s.created_at
   FROM ai_suggestion s
   WHERE s.suggestion_type = 'case_link' AND s.created_at > now() - interval '2 hours'
   ORDER BY s.created_at DESC LIMIT 20;

   SELECT ae.action, ae.summary, ae.created_at
   FROM audit_event ae
   WHERE ae.action IN ('inbound_linked','ai_suggestion_created')  -- (map to the live choice codes)
     AND ae.created_at > now() - interval '2 hours'
   ORDER BY ae.created_at DESC LIMIT 20;
   ```
   Expect a `case_link` suggestion (self-accepted under auto-attach) + an `inbound_linked` audit
   on the matched case, and NO new Case/PO minted for the chaser.
3. **Live intake smoke** (optional): send a chaser to the intake set (info@/engineers@/desk@)
   that names an OPEN case's ref and attaches a photos PDF → confirm (1)+(2) above.

## Notes for the dispatcher
- No new gate; no DDL (the `case_update`/`images_received` codes were already live per the
  engine-v2.3 deploy-order note). The live relabel is `decideTriage`'s (orchestration owns the
  open-case lookup, ADR-0019), so the classifier's `open_case_ref_match` stays dormant/forward-supported;
  Stage A still returns `receiving_work` live and Stage B relabels + attaches.
- **PR #45 review fix (2026-07-08):** the first pass had a BLOCKING bug — the orchestrator minted on
  `classification.category`, so an `attach_case` email attached to the matched case AND minted a
  DUPLICATE (violating "no new case is minted"). Fixed with an `attach_case` non-minting branch in
  `intakeOrchestrator.ts`; the images-only fast-path was also made signature-aware (orch + parser,
  Finding C). **orch + parser REDEPLOYED** (engine-v2.9; orch 67 fns). Acceptance "no new case is
  minted" is now met in code + deployed; the remaining PENDING item is the behavioural live proof on a
  real open-case-ref chaser (this section's "How to re-verify"). Full detail: `changes.md` PR#45 section.

## Verdict update — 2026-07-14 (independent PLAN-005 sweep; transcribed verbatim)

## Verdict

VERIFIED-LIVE

## Evidence

- Acceptance 1: a real arrival at `2026-07-13T15:56:51Z` produced `attach_case`,
  `case_update/images_received`, `matchTier=job_ref`, `matchCount=1`, `caseUpdateApplied=true`,
  `imagesOnly=true`, targeting open case `A.PCH26048` (`39822064-5e16-4ef6-b0aa-1f077f4f8ee5`). Offline
  corroboration passed: parser classifier 182 passed/9 skipped; baseline-v2 reported no regression; domain
  policy/routing 60/60; orchestration signal tests 12/12.
- Acceptance 2: API telemetry created case-link suggestion `d6a7688c-702c-400b-9d21-b02207c87d9a` for the
  matched case with `autoAttached=true`. The exact Durable instance recorded 34 rows and
  `CaseResolveRows=0`. It then persisted classification evidence, completed evidence backfill, extracted 70
  images, and archived 72/72 evidence items to folder `399470418892`. The `autoAttached=true` completion is
  the TKT-093 reversible `inbound_linked` path.
- Acceptance 3: the fresh eval matched baseline-v2 and `receiving_work` recall was 94.7%. Targeted parser,
  domain and orchestration suites all passed. Current main's immediately preceding exact-head full verifier
  checkpoint was 8 passed/0 failed; it was not redundantly rerun in this dispatch.
- Acceptance 4: the live decision's gate snapshot had ref-gate, images routing, case-update and auto-attach
  enabled. This is the precise previously missing conjunction: open job-ref plus image-only evidence ->
  `attach_case` and `case_update/images_received`, with no mint.
- Acceptance 5: `changes.md`, both ticket sample files, and `evidence/offline-eval-delta.md` are present and
  were reviewed.

## Pending / gaps

No behavioral gap remains. Direct PostgreSQL readback of the suggestion and audit rows was blocked by the
firewall; no temporary rule was created. The linked suggestion, no-mint execution and complete
evidence/archive chain are independently present in telemetry.

## How to re-verify

Query `triage_decision` for `attach_case` + `case_update/images_received`; require one `job_ref` match,
`caseUpdateApplied=true`, and `imagesOnly=true`. Correlate the Durable instance and require zero
`caseResolve` rows, an `autoAttached=true` case-link suggestion, and completed evidence/archive events.
When a firewall-free read path exists, corroborate suggestion `d6a7688c-…` and the matched case's
`inbound_linked` audit row.

## Confidence + unread surfaces

High confidence from the exact live event and correlated side effects. PostgreSQL rows and a direct Archive
folder listing were unread; telemetry supplied the behavioral and archive-completion evidence.
