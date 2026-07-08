# Verification — TKT-043: Images-received / report-chaser email misrouted (images-on-existing-case)

## Verdict
PENDING (implementer cannot self-certify — offline proof is green; live proof to be gathered
by the ticket-verifier).

## Evidence (offline — done)
- `scripts/eval-email/baseline-v2.json` (regenerated, `--taxonomy v2 --check` clean): eval item
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
- Deployed: `deploy/orch/main.cjs` published to `cespk-orch-dev` (Windows func 4.12); live
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
  engine-v2.3 deploy-order note). The live relabel is `decideTriage`'s (the open-case lookup is
  flow-side, ADR-0019), so the classifier's `open_case_ref_match` stays dormant/forward-compatible;
  Stage A still returns `receiving_work` live and Stage B relabels + attaches.
- **PR #45 review fix (2026-07-08):** the first pass had a BLOCKING bug — the orchestrator minted on
  `classification.category`, so an `attach_case` email attached to the matched case AND minted a
  DUPLICATE (violating "no new case is minted"). Fixed with an `attach_case` non-minting branch in
  `intakeOrchestrator.ts`; the images-only fast-path was also made signature-aware (orch + parser,
  Finding C). **orch + parser REDEPLOYED** (engine-v2.9; orch 67 fns). Acceptance "no new case is
  minted" is now met in code + deployed; the remaining PENDING item is the behavioural live proof on a
  real open-case-ref chaser (this section's "How to re-verify"). Full detail: `changes.md` PR#45 section.
