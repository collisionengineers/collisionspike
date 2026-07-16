# Operator plan excerpt — Phase D: AI vision-reasoning escalation (tier 3b)

> From `PLAN-inspection-address-repair.md` (investigation/planning session 2026-07-06). The full
> plan is preserved at
> [TKT-075 evidence](../../../done/TKT-075-inspection-corpus-pipeline/evidence/operator-note.md).

Per `docs/tickets/README.md`, as an escalation
branch in the same Function:

- Reuse the deployed AOAI (`digital-3339-resource`, `gpt-5` already live per the registry);
  structured outputs, temperature 0, ≤3–4 photos, "only report what is visibly evidenced".
- Own gate `LOCATION_ASSIST_AI_ENABLED` + per-case/per-day caps + spend telemetry; candidates
  re-geocoded via Maps with `ai_reasoning` provenance.
- UI: reviewer-pressed "Try a deeper photo-based suggestion" when the deterministic tier is
  weak.
- Operator: production AI sign-off per docs/tickets/BOARD.md E2.
