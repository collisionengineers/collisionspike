# Verification — TKT-023: Link follow-up documents/emails to the existing case + Box
## Verdict
DEPLOYED GATED-OFF (2026-07-02) — NOT yet active; needs D7 + `TRIAGE_REF_GATE_ENABLED`
## Evidence
- Repro material in evidence/ (operator-note.md; sent/ outgoing request 575985.eml;
  original/ incoming reply Our ref 576299.eml + 16DL.pdf + 16DL diminution PDF).
- The rules-engine-v2 plan's own evidence base names this exact failure mode: "`Our ref: 576299` follow-up
  mints a new case (TKT-023): the pre-mint path never checks job refs against open cases" — see
  [rules_engine_v2_plan_9ba034c4.plan.md § Evidence base](../../../plans/rules_engine_v2_plan_9ba034c4.plan.md).
- The fix — a generalised ref-gate (`triagePolicy` activity + `POST /api/internal/triage/context` +
  `suggest-link` + the SPA accept/reject affordance) — is built and deployed live on
  `cespk-api-dev`/`cespk-orch-dev`, but runs its **acting** decision on the `TRIAGE_*` app-setting gates,
  which are unset (default off ⇒ `proceed_default`, today's behaviour unchanged). Only the **shadow**
  decision path (telemetry-only, all gates forced on) is always-on.
- Confirms the gap is real today: both of this ticket's own eval-corpus samples still MISS on the
  deployed (gate-off) engine — `tkt023-outbound-request` and `tkt023-original-reply` both score
  `category_correct: false` in [baseline-v2.json](../../../../scripts/eval-email/baseline-v2.json) (part of
  the eval harness's documented "context miss" set — see [README § Ground truth](../../../../scripts/eval-email/README.md)).
## Pending / gaps
- 🔒 D7 DDL delta apply (operator, [docs/gated.md](../../../gated.md) §D7) — the taxonomy-v2 engine tag and
  the `TRIAGE_*` gate flips are blocked on this landing first (deploy-order rule in the delta file).
- 🔒 `TRIAGE_REF_GATE_ENABLED` flip (per-behaviour gate under D6) once D7 is live.
- No live probe yet of the acting (non-shadow) ref-gate path — it cannot be exercised until the gate is on.
## How to re-verify
Once D7 + `TRIAGE_REF_GATE_ENABLED` are live: replay the outgoing request then the incoming reply
(`evidence/original/Our ref 576299.eml`); confirm the reply attaches to the existing case (no duplicate),
the documents land in the case evidence and the case Box folder, and the outstanding-document chaser is
cleared. In the meantime, the shadow-decision telemetry in App Insights `customEvents` can be inspected to
confirm the ref-gate *would* have caught it.

## Verdict update — 2026-07-09 (ticket-verifier dispatch)

PENDING (update) — and the recorded verdict text below/above is STALE IN THE TICKET'S FAVOUR: the gates it awaits (D7 + TRIAGE_REF_GATE_ENABLED, later TRIAGE_AUTO_ATTACH_ENABLED) went live 2026-07-03/07 and the mechanism is ACTING with strong independent proof: orch triage_decision 7d = 30x attach_case + 51x suggest_attach (e.g. AX26034 job_ref exact-match auto-attach 2026-07-08T12:50:51Z); Box folder AX26034 holds the original AND the follow-up InspectionRequest_Update PDF created 12s after the attach decision; five SPA rows read "Linked to case"; VRM-tier matches NEVER auto-attached (rung-3 invariant held on every sampled event). REAL GAP: acceptance line 3 (attach marks the outstanding-document chaser satisfied) is NOT BUILT — zero chaser writes on the attach path. DISPOSITION: reopened verify->now; the chaser-satisfaction hook goes to the intake batch. DB row-level checks queued for the data pass. Classify-layer note: the ticket's two eval samples still mislabel by category, but rung-3 runs pre-mint on every category so the linking behaviour is correct — category-label refinement optional.

Verified by: ticket-verifier dispatch, transcribed by the orchestrating session, 2026-07-09.
