# Verification — TKT-023: Link follow-up documents/emails to the existing case + Box
## Verdict
DEPLOYED GATED-OFF (2026-07-02) — NOT yet active; needs D7 + `TRIAGE_REF_GATE_ENABLED`
## Evidence
- Repro material in evidence/ (operator-note.md; sent/ outgoing request 575985.eml;
  original/ incoming reply Our ref 576299.eml + 16DL.pdf + 16DL diminution PDF).
- The rules-engine-v2 plan's own evidence base names this exact failure mode: "`Our ref: 576299` follow-up
  mints a new case (TKT-023): the pre-mint path never checks job refs against open cases" — see
  [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](../../plans/rules_engine_v2_plan_9ba034c4.plan.md).
- The fix — a generalised ref-gate (`triagePolicy` activity + `POST /api/internal/triage/context` +
  `suggest-link` + the SPA accept/reject affordance) — is built and deployed live on
  `cespk-api-dev`/`cespk-orch-dev`, but runs its **acting** decision on the `TRIAGE_*` app-setting gates,
  which are unset (default off ⇒ `proceed_default`, today's behaviour unchanged). Only the **shadow**
  decision path (telemetry-only, all gates forced on) is always-on.
- Confirms the gap is real today: both of this ticket's own eval-corpus samples still MISS on the
  deployed (gate-off) engine — `tkt023-outbound-request` and `tkt023-original-reply` both score
  `category_correct: false` in [baseline-v2.json](../../../scripts/eval-email/baseline-v2.json) (part of
  the eval harness's documented "context miss" set — see [README § Ground truth](../../../scripts/eval-email/README.md)).
## Pending / gaps
- 🔒 D7 DDL delta apply (operator, [docs/gated.md](../../gated.md) §D7) — the taxonomy-v2 engine tag and
  the `TRIAGE_*` gate flips are blocked on this landing first (deploy-order rule in the delta file).
- 🔒 `TRIAGE_REF_GATE_ENABLED` flip (per-behaviour gate under D6) once D7 is live.
- No live probe yet of the acting (non-shadow) ref-gate path — it cannot be exercised until the gate is on.
## How to re-verify
Once D7 + `TRIAGE_REF_GATE_ENABLED` are live: replay the outgoing request then the incoming reply
(`evidence/original/Our ref 576299.eml`); confirm the reply attaches to the existing case (no duplicate),
the documents land in the case evidence and the case Box folder, and the outstanding-document chaser is
cleared. In the meantime, the shadow-decision telemetry in App Insights `customEvents` can be inspected to
confirm the ref-gate *would* have caught it.
