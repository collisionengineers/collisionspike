# Verification — TKT-159: Reconcile every live feature gate with intended production behavior

## Verdict
PENDING

## Evidence
- 2026-07-14 read-only `az functionapp config appsettings list` returned
  `AI_CHAT_ENABLED=true` and `ASSISTANT_WRITE_TIER_ENABLED=true` on `cespk-api-dev`.
- `docs/operations/live-environment.md` records the 2026-07-11 validated/deployed activation and operator-attested
  approval state.
- Registry/runbook correction is recorded in `changes.md`; no live setting was mutated.

## Pending / gaps
The code-derived all-component gate inventory, complete intent classification, per-active-feature
behavioral smoke matrix, restart monitoring and CI drift check are not implemented yet.

## How to re-verify
Regenerate the gate inventory, compare it to read-only live settings and registry intent, then run one behavioral smoke test per active gate and the CI drift check.

## 2026-07-20 addendum — live readback done, verdict still PENDING

A full live `az functionapp config appsettings list` readback was taken across every relevant app
(`cespk-api-dev`, `cespk-orch-dev`, and the four retained Function apps), resolving nearly every gate's
live state — see `docs/operations/feature-gates.md` and `changes.md` for the complete trail. Two gates
(`DELETE_CASE_IMAGE_ENABLED`, `MCP_IMAGE_INGEST_ENABLED`) were flipped live by explicit operator
direction, each with a settings backup and a post-change health check (not a behavioral smoke test).

This still does not close the ticket:
- **No CI drift check exists.** Acceptance line "A machine-readable registry check fails CI when code
  gate names, documented intended states and tracked live-state entries drift" is not built.
- **No behavioral smoke test per active gate was run** — only a health/restart check (app running,
  function count intact, no new 5xx) for the two newly-flipped gates. The ~30 other live-on gates were
  not individually smoke-tested this pass.
- **No final Chrome/API/MCP/Box/Outlook read-only sweep was run.**
- Two live incidents were found and left open (capture-ingress exposure with no mitigation performed;
  a likely stale archive-holding deploy, diagnosed not fixed) — both operator-directed to stay
  undisturbed this session; see `TKT-200` and `TKT-228`.
- One new drift item (`BOX_REG_FOLDER_ENABLED` live-on, contradicting ticket prose) needs an operator
  decision, not yet made.

Verdict stays **PENDING**.
